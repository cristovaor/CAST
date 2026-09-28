import type { ptBR } from '../pt-BR';
import type { Translation } from '../../types';
import acquisition from './acquisition';
import analysis from './analysis';
import annotations from './annotations';
import auth from './auth';
import common from './common';
import dashboard from './dashboard';
import domain from './domain';
import nav from './nav';
import participants from './participants';
import processing from './processing';
import projects from './projects';
import sessions from './sessions';
import studies from './studies';
import ui from './ui';
import validation from './validation';
import videos from './videos';

export const en = {
  acquisition,
  analysis,
  annotations,
  auth,
  common,
  dashboard,
  domain,
  nav,
  participants,
  processing,
  projects,
  sessions,
  studies,
  ui,
  validation,
  videos,
} satisfies Translation<typeof ptBR>;
