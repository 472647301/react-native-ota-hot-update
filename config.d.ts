export declare const PlatformType: {
  readonly iOS: 'ios';
  readonly Android: 'android';
};

export interface ReactNativeOtaVersionEntity {
  id: number;
  version: number;
  desc: string | null;
  name: string;
  downloadUrl: string | null;
  platform: string;
  fileSize: number | null;
  ip: string;
  channel: string | null;
  type: number;
  enable: number;
  isMandatory: number;
  updateTime: Date;
  createTime: Date;
}

export interface ReactNativeOtaConfig {
  name: string;
  version: string;
  baseUrl: string;
  platform: Array<'ios' | 'android'>;
  desc?: string;
  channel?: string;
  isMandatory?: number;
  downloadUrl?: string;
  success?: (data: ReactNativeOtaVersionEntity) => void;
}

export interface ReactNativeOtaConfigContext {
  PlatformType: typeof PlatformType;
  defineConfig: typeof defineConfig;
  argv: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
}

export type ReactNativeOtaConfigFactory = (
  context: ReactNativeOtaConfigContext
) => ReactNativeOtaConfig | Promise<ReactNativeOtaConfig>;

export declare function defineConfig(config: ReactNativeOtaConfig): ReactNativeOtaConfig;
export declare function defineConfig(
  config: ReactNativeOtaConfigFactory
): ReactNativeOtaConfigFactory;