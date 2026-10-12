export type FallbackApi = {
  name: string;
  endpoint: string;
  authEnv?: string;
  method?: 'GET' | 'POST';
  adapter?: 'generic' | 'usebypass' | 'omegatech';
};

export type PersistedConfig = {
  authorizedGuildIds: string[];
  fallbackApis: FallbackApi[];
  autoBypassChannels: AutoBypassChannel[];
  settings: Record<string, unknown>;
};

export type AutoBypassChannel = {
  guildId: string;
  channelId: string;
  deleteSource: boolean;
};

export type BypassResult = {
  ok: boolean;
  destination?: string;
  service?: string;
  pending?: string;
  jobId?: string;
  pollUrl?: string;
  captchaUrl?: string;
  wsUrl?: string;
  error?: string;
  ms?: number;
  provider: string;
};
