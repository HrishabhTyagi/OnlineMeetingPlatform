export interface MobileMediaState {
  audioEnabled: boolean;
  videoEnabled: boolean;
  screenSharing: boolean;
  streamId?: string;
}

let activeMediaStream: any = null;
let activeScreenStream: any = null;

function stopStream(stream: any) {
  stream?.getTracks?.().forEach((track: any) => track.stop?.());
}

function getNativeWebRtc() {
  try {
    return require('react-native-webrtc');
  } catch {
    return null;
  }
}

export async function requestMeetingMedia(kind: 'audio' | 'video' | 'screen'): Promise<MobileMediaState> {
  if (kind === 'screen') {
    const displayMedia = (globalThis.navigator?.mediaDevices as any)?.getDisplayMedia;
    if (displayMedia) {
      stopStream(activeScreenStream);
      activeScreenStream = await displayMedia.call(globalThis.navigator.mediaDevices, { video: true, audio: false });
      return { audioEnabled: true, videoEnabled: Boolean(activeMediaStream), screenSharing: true, streamId: activeScreenStream.id };
    }

    return {
      audioEnabled: Boolean(activeMediaStream),
      videoEnabled: Boolean(activeMediaStream),
      screenSharing: true,
    };
  }

  const constraints = {
    audio: true,
    video: kind === 'video',
  };

  const webGetUserMedia = globalThis.navigator?.mediaDevices?.getUserMedia;
  if (webGetUserMedia) {
    stopStream(activeMediaStream);
    activeMediaStream = await webGetUserMedia.call(globalThis.navigator.mediaDevices, constraints);
    return {
      audioEnabled: true,
      videoEnabled: kind === 'video',
      screenSharing: Boolean(activeScreenStream),
      streamId: activeMediaStream.id,
    };
  }

  const nativeWebRtc = getNativeWebRtc();
  if (nativeWebRtc?.mediaDevices?.getUserMedia) {
    stopStream(activeMediaStream);
    activeMediaStream = await nativeWebRtc.mediaDevices.getUserMedia(constraints);
    return {
      audioEnabled: true,
      videoEnabled: kind === 'video',
      screenSharing: Boolean(activeScreenStream),
      streamId: activeMediaStream.id,
    };
  }

  return {
    audioEnabled: kind === 'audio' || kind === 'video',
    videoEnabled: kind === 'video',
    screenSharing: false,
  };
}

export function stopMeetingMedia(kind?: 'audio' | 'video' | 'screen') {
  if (!kind || kind === 'screen') {
    stopStream(activeScreenStream);
    activeScreenStream = null;
  }

  if (!kind || kind === 'audio' || kind === 'video') {
    stopStream(activeMediaStream);
    activeMediaStream = null;
  }
}
