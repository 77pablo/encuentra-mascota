// El paquete `react-test-renderer` está instalado (lo trae `jest-expo`), pero
// sus `@types` no están en el node_modules compartido de este worktree y no
// podemos correr `npm install` acá. Declaración ambiental mínima para poder
// usarlo en tests de componentes sin bloquear `tsc --noEmit`.
declare module 'react-test-renderer' {
  import type { ReactElement } from 'react';

  export interface TestRenderer {
    toJSON(): any;
    unmount(): void;
    update(nextElement: ReactElement): void;
  }

  export function create(element: ReactElement): TestRenderer;
  export function act(callback: () => void | Promise<void>): Promise<void>;
}
