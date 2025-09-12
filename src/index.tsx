import { NativeModules, Platform } from 'react-native';
import type { DownloadManager } from './download';
import type { UpdateOption } from './type';

const LINKING_ERROR =
  `The package 'react-native-ota-hot-update' doesn't seem to be linked. Make sure: \n\n` +
  Platform.select({ ios: "- You have run 'pod install'\n", default: '' }) +
  '- You rebuilt the app after installing the package\n' +
  '- You are not using Expo Go\n';

// @ts-expect-error
const isTurboModuleEnabled = global.__turboModuleProxy != null;

const OtaHotUpdateModule = isTurboModuleEnabled
  ? require('./NativeOtaHotUpdate').default
  : NativeModules.OtaHotUpdate;

const RNhotupdate = OtaHotUpdateModule
  ? OtaHotUpdateModule
  : new Proxy(
      {},
      {
        get() {
          throw new Error(LINKING_ERROR);
        },
      }
    );

const downloadBundleFile = async (
  downloadManager: DownloadManager,
  uri: string,
  headers?: object,
  callback?: (received: string, total: string) => void
) => {
  const res = await downloadManager
    .config({
      fileCache: Platform.OS === 'android',
      path:
        !!downloadManager?.fs?.dirs?.LibraryDir && Platform.OS === 'ios'
          ? `${downloadManager.fs.dirs.LibraryDir}/${new Date().valueOf()}_hotupdate.zip`
          : undefined,
    })
    .fetch('GET', uri, {
      ...headers,
    })
    .progress((received, total) => {
      if (callback) {
        callback(received, total);
      }
    });
  return res.path();
};
function setupBundlePath(path: string, extension?: string): Promise<boolean> {
  return RNhotupdate.setupBundlePath(path, extension);
}
function setupExactBundlePath(path: string): Promise<boolean> {
  return RNhotupdate.setExactBundlePath(path);
}
function deleteBundlePath(): Promise<boolean> {
  return RNhotupdate.deleteBundle(1);
}
function getCurrentVersion(): Promise<string> {
  return RNhotupdate.getCurrentVersion(0);
}

type Metadata = object | number | string | boolean | null;

function getUpdateMetadata<T extends Metadata = Metadata>(): Promise<T> {
  return RNhotupdate.getUpdateMetadata(0).then(
    (metadataString: string | null) => {
      try {
        return metadataString ? JSON.parse(metadataString) : null;
      } catch (error) {
        return Promise.reject(new Error('Error parsing metadata'));
      }
    }
  );
}
function rollbackToPreviousBundle(): Promise<boolean> {
  return RNhotupdate.rollbackToPreviousBundle(0);
}
async function getVersionAsNumber() {
  const rawVersion = await getCurrentVersion();
  return +rawVersion;
}
function setCurrentVersion(version: number): Promise<boolean> {
  return RNhotupdate.setCurrentVersion(version + '');
}
function setUpdateMetadata<T extends Metadata = Metadata>(
  metadata: T
): Promise<boolean> {
  try {
    const metadataString = JSON.stringify(metadata);
    return RNhotupdate.setUpdateMetadata(metadataString);
  } catch (error) {
    return Promise.reject(new Error('Failed to stringify metadata'));
  }
}
async function resetApp() {
  RNhotupdate.restart();
}
function removeBundle(restartAfterRemoved?: boolean) {
  deleteBundlePath().then((data) => {
    if (data && restartAfterRemoved) {
      setTimeout(() => {
        resetApp();
      }, 300);
      if (data) {
        setCurrentVersion(0);
      }
    }
  });
}
const installFail = (option?: UpdateOption, e?: any) => {
  option?.updateFail?.(JSON.stringify(e));
  console.error('Download bundle fail', JSON.stringify(e));
};
async function downloadBundleUri(
  downloadManager: DownloadManager,
  uri: string,
  version?: number,
  option?: UpdateOption
) {
  if (!uri) {
    return installFail(option, 'Please give a valid URL!');
  }
  if (version) {
    const currentVersion = await getVersionAsNumber();
    if (version <= currentVersion) {
      return installFail(
        option,
        'Please give a bigger version than the current version, the current version now has setted by: ' +
          currentVersion
      );
    }
  }

  try {
    const path = await downloadBundleFile(
      downloadManager,
      uri,
      option?.headers,
      option?.progress
    );
    if (!path) {
      return installFail(option, `Cannot download bundle file: ${path}`);
    }

    const success = await setupBundlePath(path, option?.extensionBundle);
    if (!success) {
      return installFail(option);
    }
    if (version) {
      setCurrentVersion(version);
    }
    if (option?.metadata) {
      setUpdateMetadata(option.metadata);
    }
    option?.updateSuccess?.();

    if (option?.restartAfterInstall) {
      setTimeout(() => {
        resetApp();
      }, option?.restartDelay || 300);
    }
  } catch (e) {
    installFail(option, e);
  }
}
export default {
  setupBundlePath,
  setupExactBundlePath,
  removeUpdate: removeBundle,
  downloadBundleUri,
  resetApp,
  getCurrentVersion: getVersionAsNumber,
  setCurrentVersion,
  getUpdateMetadata,
  setUpdateMetadata,
  rollbackToPreviousBundle,
};
