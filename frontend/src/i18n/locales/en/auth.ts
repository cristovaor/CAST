import type ptAuth from '../pt-BR/auth';
import type { Translation } from '../../types';

const auth = {
  preferences: 'Display preferences',
  title: 'Sign in to your account',
  subtitle: 'Sign in to manage studies, videos and processing jobs.',
  google: {
    signIn: 'Sign in with Google',
    connecting: 'Connecting...',
    failed: 'Could not sign in with Google. Please try again.',
  },
  divider: 'or continue with email',
  email: {
    label: 'Email',
    placeholder: 'name@institution.edu',
  },
  password: {
    label: 'Password',
    placeholder: 'Enter your password',
    show: 'Show password',
    hide: 'Hide password',
    capsLock: 'Caps Lock is on.',
    forgot: 'Forgot your password? Contact your team administrator.',
  },
  submit: 'Sign in to CAST Pro',
  submitting: 'Signing in...',
  invalidCredentials: 'Invalid email or password. Check your credentials and try again.',
  secure: {
    title: 'Secure environment',
    note: 'Access restricted to researchers, administrators and authorised teams.',
  },
  invite: 'You have been invited to CAST Pro. Sign in to accept the invitation.',
  brand: {
    eyebrow: 'Cognitive Action & Study Tracking',
    headline: 'Scientific analysis of micro-actions in cognitive studies.',
    description:
      'Organise projects, process facial videos, review human annotations and track data quality in a single secure environment.',
    features: {
      pipeline: 'Traceable analysis pipeline',
      governance: 'Sensitive-data governance and auditing',
      quality: 'Quality metrics for videos and models',
    },
    badges: {
      lgpd: 'LGPD-ready',
      audit: 'Audit trail',
      registry: 'Model registry',
      research: 'Research-grade',
    },
  },
  logout: 'Sign out',
} satisfies Translation<typeof ptAuth>;

export default auth;
