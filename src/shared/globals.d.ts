import type { UsageBridge } from './usage';

declare global {
  interface Window {
    usage: UsageBridge;
  }
}

export {};
