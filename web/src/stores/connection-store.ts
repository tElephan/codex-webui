/**
 * Zustand store for WebSocket connection state.
 */
import { create } from 'zustand';

interface ConnectionState {
  connected: boolean;
  epoch: number;
  setConnected: (connected: boolean) => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  connected: false,
  epoch: 0,
  setConnected: (connected: boolean) => set((state) => ({
    connected,
    epoch: connected && !state.connected ? state.epoch + 1 : state.epoch,
  })),
}));
