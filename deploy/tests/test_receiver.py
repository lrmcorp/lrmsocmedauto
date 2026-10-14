import importlib.util
import io
import json
import os
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('receiver', Path(__file__).resolve().parents[1] / 'receiver.py')
receiver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(receiver)
bootstrap_spec = importlib.util.spec_from_file_location('bootstrap', Path(__file__).resolve().parents[1] / 'bootstrap.py')
bootstrap = importlib.util.module_from_spec(bootstrap_spec)
bootstrap_spec.loader.exec_module(bootstrap)


class ReceiverTests(unittest.TestCase):
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
