'use client';

import { useForm, FormProvider } from 'react-hook-form';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { Button } from '@gitroom/react/form/button';
import { Input } from '@gitroom/react/form/input';
import { useMemo, useState } from 'react';
import { classValidatorResolver } from '@hookform/resolvers/class-validator';
import { LoginUserDto } from '@gitroom/nestjs-libraries/dtos/auth/login.user.dto';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

type Inputs = {
  username: string;
  password: string;
  providerToken: '';
  provider: 'LOCAL';
};

export function Login() {
  const t = useT();
  const [loading, setLoading] = useState(false);
  const resolver = useMemo(() => classValidatorResolver(LoginUserDto), []);
  const form = useForm<Inputs>({
    resolver,
    defaultValues: { providerToken: '', provider: 'LOCAL' },
  });
  const fetchData = useFetch();
  const submit = async (data: Inputs) => {
    setLoading(true);
    try {
      const response = await fetchData('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          ...data,
          username: data.username.trim(),
          provider: 'LOCAL',
          providerToken: '',
        }),
      });
      if (!response.ok)
        form.setError('username', {
          message:
            response.status === 400
              ? await response.text()
              : 'Unable to sign in. Please try again.',
        });
    } catch {
      form.setError('username', {
        message: 'Unable to connect. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  };
  return (
    <FormProvider {...form}>
      <form className="flex-1 flex" onSubmit={form.handleSubmit(submit)}>
        <div className="flex flex-col flex-1">
          <h1 className="text-[30px] font-[500]">{t('sign_in', 'Sign In')}</h1>
          <p className="mt-3 mb-7 text-sm text-textItemBlur">
            Sign in with your username and password.
          </p>
          <Input
            label="Username"
            {...form.register('username')}
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="Username"
          />
          <Input
            label="Password"
            translationKey="label_password"
            {...form.register('password')}
            autoComplete="current-password"
            type="password"
            placeholder={t('label_password', 'Password')}
          />
          <Button
            type="submit"
            className="w-full !h-[52px] mt-4"
            loading={loading}
          >
            {t('sign_in_1', 'Sign in')}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
