'use client';

import { FormProvider, useForm } from 'react-hook-form';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import Link from 'next/link';
import { Button } from '@gitroom/react/form/button';
import { Input } from '@gitroom/react/form/input';
import { useMemo, useState } from 'react';
import { classValidatorResolver } from '@hookform/resolvers/class-validator';
import { CreateOrgUserDto } from '@gitroom/nestjs-libraries/dtos/auth/create.org.user.dto';
import { useRouter } from 'next/navigation';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

type Inputs = {
  email: string;
  password: string;
  company: string;
  providerToken: string;
  provider: string;
};

export function Register() {
  const t = useT();
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const fetchData = useFetch();
  const resolver = useMemo(() => classValidatorResolver(CreateOrgUserDto), []);
  const form = useForm<Inputs>({
    resolver,
    defaultValues: { provider: 'LOCAL', providerToken: '' },
  });
  const submit = async (data: Inputs) => {
    setLoading(true);
    try {
      const response = await fetchData('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ ...data, provider: 'LOCAL', providerToken: '' }),
      });
      if (response.status === 200) {
        router.push(
          response.headers.get('activate') === 'true'
            ? '/auth/activate'
            : '/auth/login'
        );
      } else {
        form.setError('email', { message: await response.text() });
      }
    } catch {
      form.setError('email', {
        message: 'Unable to create your account. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  };
  return (
    <FormProvider {...form}>
      <form className="flex-1 flex" onSubmit={form.handleSubmit(submit)}>
        <div className="flex flex-col flex-1">
          <h1 className="text-[30px] font-[500]">{t('sign_up', 'Sign Up')}</h1>
          <p className="mt-3 mb-7 text-sm text-textItemBlur">
            Create your internal LRM account using email and password.
          </p>
          <Input
            label="Email"
            translationKey="label_email"
            {...form.register('email')}
            type="email"
            autoComplete="username"
          />
          <Input
            label="Password"
            translationKey="label_password"
            {...form.register('password')}
            type="password"
            autoComplete="new-password"
          />
          <Input
            label="Company"
            translationKey="label_company"
            {...form.register('company')}
            type="text"
            autoComplete="organization"
          />
          <Button
            type="submit"
            className="w-full !h-[52px] mt-4"
            loading={loading}
          >
            {t('create_account', 'Create Account')}
          </Button>
          <p className="mt-4 text-sm text-center">
            {t('already_have_an_account', 'Already Have An Account?')}{' '}
            <Link href="/auth/login" className="underline">
              {t('sign_in', 'Sign In')}
            </Link>
          </p>
        </div>
      </form>
    </FormProvider>
  );
}
