import importlib.util
import io
import json
import os
from pathlib import Path
import tarfile
import tempfile
import subprocess
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('receiver', Path(__file__).resolve().parents[1] / 'receiver.py')
receiver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(receiver)
bootstrap_spec = importlib.util.spec_from_file_location('bootstrap', Path(__file__).resolve().parents[1] / 'bootstrap.py')
bootstrap = importlib.util.module_from_spec(bootstrap_spec)
bootstrap_spec.loader.exec_module(bootstrap)


class ReceiverTests(unittest.TestCase):
    def test_image_rollback_never_synchronizes_an_older_database_schema(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            current, previous = 'a' * 40, 'b' * 40
            (root / 'current-tag').write_text(current + '\n')
            events = []
            with patch.object(receiver, 'ROOT', root), patch.object(receiver, 'run', return_value='sha256:image'), patch.object(receiver, 'compose', side_effect=lambda tag, *args, **kwargs: events.append(args)), patch.object(receiver, 'backup'), patch.object(receiver, 'healthy', return_value=True):
                receiver.deploy(previous, upload=False, migrate=False)
            self.assertFalse(any(args[0] == 'run' for args in events))
            self.assertIn(('up', '-d', '--no-deps', 'app'), events)
            self.assertEqual((root / 'current-tag').read_text().strip(), previous)

    def registry_pull(self, directory, *, wrong_source=False, timeout=False):
        root = Path(directory)
        (root / 'incoming').mkdir()
        calls = []
        def run(args, **kwargs):
            calls.append((args, kwargs))
            if args[1] == 'info':
                return 'overlayfs'
            if args[1] == 'pull' and timeout:
                raise subprocess.TimeoutExpired(args, 900)
            if args[1:3] == ['image', 'inspect']:
                return json.dumps({
                    'org.opencontainers.image.source': 'other-project' if wrong_source else 'https://github.com/lrmcorp/lrmsocmedauto',
                    'org.opencontainers.image.revision': 'a' * 40,
                })
        auth = SimpleNamespace(buffer=io.BytesIO(b'{"username":"lrmcorp","token":"test-ephemeral-token"}'))
        with patch.object(receiver, 'ROOT', root), patch.object(receiver.sys, 'stdin', auth), patch.object(receiver, 'run', side_effect=run), patch.object(receiver.shutil, 'disk_usage', return_value=SimpleNamespace(free=20 * 1024**3)):
            try:
                receiver.pull_registry('a' * 40, 'sha256:' + 'b' * 64)
            finally:
                self.assertEqual(list((root / 'incoming').iterdir()), [])
                self.registry_calls = calls
        return calls

    def test_registry_is_pinned_and_credentials_removed(self):
        with tempfile.TemporaryDirectory() as directory:
            calls = self.registry_pull(directory)
        pull = next(item for item in calls if item[0][1] == 'pull')
        self.assertEqual(pull[0][2], 'ghcr.io/lrmcorp/lrmsocmedauto@sha256:' + 'b' * 64)
        self.assertGreater(pull[1]['timeout'], 0)
        self.assertLessEqual(pull[1]['timeout'], 900)
        self.assertEqual(calls[-1][0][-1], 'lrmsosmed:' + 'a' * 40)
        self.assertFalse(any('test-ephemeral-token' in str(args) for args, _ in calls))

    def test_registry_wrong_source_cannot_become_deployable_image(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(RuntimeError, 'source/revision'):
                self.registry_pull(directory, wrong_source=True)
        self.assertFalse(any(args[1] == 'tag' for args, _ in self.registry_calls))

    def test_registry_transfer_timeout_removes_credentials_and_never_tags(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(RuntimeError, '15 minutes'):
                self.registry_pull(directory, timeout=True)
        self.assertFalse(any(args[1] == 'tag' for args, _ in self.registry_calls))

    def test_project_layout_rejects_links_to_other_application_data(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / 'project'
            root.mkdir()
            unrelated = Path(directory) / 'unrelated'
            unrelated.mkdir(mode=0o700)
            (root / 'shared').symlink_to(unrelated, target_is_directory=True)
            with self.assertRaisesRegex(RuntimeError, 'symlinks'):
                bootstrap.create_layout(root)
            self.assertEqual(list(unrelated.iterdir()), [])
            self.assertEqual(unrelated.stat().st_mode & 0o777, 0o700)

    def test_private_setup_umask_keeps_secrets_private_and_media_readable(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / 'project'
            original = os.umask(0o077)
            try:
                bootstrap.create_layout(root)
            finally:
                os.umask(original)
            self.assertEqual(root.stat().st_mode & 0o777, 0o700)
            self.assertEqual((root / 'access').stat().st_mode & 0o777, 0o700)
            self.assertEqual((root / 'backups').stat().st_mode & 0o777, 0o700)
            self.assertEqual((root / 'shared' / 'uploads').stat().st_mode & 0o777, 0o755)

    def archive(self, path, *, tags=None, revision=None, source=None):
        tag = 'a' * 40
        config = {'config': {'Labels': {
            'org.opencontainers.image.revision': revision or tag,
            'org.opencontainers.image.source': source or 'https://github.com/lrmcorp/lrmsocmedauto',
        }}}
        manifest = [{'RepoTags': tags or [f'lrmsosmed:{tag}'], 'Config': 'config.json', 'Layers': []}]
        with tarfile.open(path, 'w:gz') as bundle:
            for name, data in [('manifest.json', manifest), ('config.json', config)]:
                content = json.dumps(data).encode()
                member = tarfile.TarInfo(name)
                member.size = len(content)
                bundle.addfile(member, io.BytesIO(content))
        return tag

    def test_expected_image_is_accepted_without_extracting_files(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'image.tar.gz'
            tag = self.archive(path)
            self.assertGreater(receiver.validate_archive(path, tag), 0)
            self.assertEqual(list(Path(directory).iterdir()), [path])

    def test_other_project_tags_and_additional_tags_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'image.tar.gz'
            for tags in [['cctv:latest'], ['lrmsosmed:' + 'a' * 40, 'cctv:latest']]:
                self.archive(path, tags=tags)
                with self.assertRaisesRegex(RuntimeError, 'exact lrmsosmed'):
                    receiver.validate_archive(path, 'a' * 40)

    def test_wrong_revision_and_source_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'image.tar.gz'
            self.archive(path, revision='b' * 40)
            with self.assertRaisesRegex(RuntimeError, 'revision'):
                receiver.validate_archive(path, 'a' * 40)
            self.archive(path, source='https://github.com/other/project')
            with self.assertRaisesRegex(RuntimeError, 'source'):
                receiver.validate_archive(path, 'a' * 40)

    def test_shell_commands_and_abbreviated_revisions_never_reach_docker(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / '.lrmsosmed-owned').touch()
            with patch.object(receiver, 'ROOT', root), patch.object(receiver.os, 'geteuid', return_value=0), patch.object(receiver, 'run') as run:
                for command in ['bash', 'deploy abc123', 'deploy ' + 'a' * 40 + '; reboot', 'status\nreboot']:
                    with patch.object(receiver.sys, 'argv', ['receiver', command]):
                        with self.assertRaisesRegex(RuntimeError, 'Allowed commands'):
                            receiver.main()
                run.assert_not_called()

    def test_failed_readiness_resumes_previous_image_and_keeps_current_tag(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            previous, target = 'a' * 40, 'b' * 40
            (root / 'current-tag').write_text(previous + '\n')
            events = []
            def compose(tag, *args, **kwargs):
                events.append((tag, args))
            with patch.object(receiver, 'ROOT', root), patch.object(receiver, 'run', return_value='sha256:image'), patch.object(receiver, 'compose', side_effect=compose), patch.object(receiver, 'backup', side_effect=lambda tag: events.append(('backup', tag))), patch.object(receiver, 'healthy', side_effect=[False, True]):
                with self.assertRaisesRegex(RuntimeError, 'readiness'):
                    receiver.deploy(target, upload=False)
            self.assertEqual((root / 'current-tag').read_text().strip(), previous)
            backup_index = events.index(('backup', previous))
            migration_index = next(i for i, event in enumerate(events) if event[0] == target and event[1][:1] == ('run',))
            self.assertLess(backup_index, migration_index)
            self.assertIn((previous, ('up', '-d', '--no-deps', 'app')), events)
            self.assertFalse(any('down' in event[1] for event in events if event[0] != 'backup'))


if __name__ == '__main__':
    unittest.main()
