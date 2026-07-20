// Polyfill WebRTC globals for LiveKit in React Native JS engine

const g = typeof globalThis !== 'undefined' ? (globalThis as any) : typeof window !== 'undefined' ? (window as any) : {};

class DummyMediaStreamTrack {
  kind = 'audio';
  id = 'dummy-audio-track-id';
  label = 'dummy-audio-track';
  enabled = true;
  muted = false;
  readyState = 'live';
  stop() {}
  addEventListener() {}
  removeEventListener() {}
  dispatchEvent() {
    return true;
  }
  clone() {
    return this;
  }
  getCapabilities() {
    return {};
  }
  getConstraints() {
    return {};
  }
  getSettings() {
    return {};
  }
}

class DummyMediaStream {
  id = 'dummy-media-stream-id';
  active = true;
  getTracks() {
    return [new DummyMediaStreamTrack()];
  }
  getAudioTracks() {
    return [new DummyMediaStreamTrack()];
  }
  getVideoTracks() {
    return [];
  }
  getTrackById() {
    return new DummyMediaStreamTrack();
  }
  addTrack() {}
  removeTrack() {}
  clone() {
    return this;
  }
  addEventListener() {}
  removeEventListener() {}
}

if (typeof g.RTCPeerConnection === 'undefined') {
  class DummyRTCDataChannel {
    readyState = 'open';
    send() {}
    close() {}
    addEventListener() {}
    removeEventListener() {}
    onopen: any = null;
    onclose: any = null;
    onmessage: any = null;
    onerror: any = null;
  }

  class DummyRTCPeerConnection {
    localDescription: any = null;
    remoteDescription: any = null;
    signalingState = 'stable';
    connectionState = 'connected';
    iceConnectionState = 'connected';
    iceGatheringState = 'complete';
    onicecandidate: any = null;
    ontrack: any = null;
    ondatachannel: any = null;
    onconnectionstatechange: any = null;
    oniceconnectionstatechange: any = null;
    onicegatheringstatechange: any = null;
    onsignalingstatechange: any = null;

    async createOffer(options?: any) {
      return { type: 'offer', sdp: 'v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n' };
    }
    async createAnswer(options?: any) {
      return { type: 'answer', sdp: 'v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n' };
    }
    async setLocalDescription(desc?: any) {
      this.localDescription = desc || { type: 'offer', sdp: '' };
      setTimeout(() => {
        if (this.onicecandidate) {
          try {
            this.onicecandidate({ candidate: null });
          } catch (e) {}
        }
        if (this.onicegatheringstatechange) {
          try {
            this.onicegatheringstatechange();
          } catch (e) {}
        }
        if (this.oniceconnectionstatechange) {
          try {
            this.oniceconnectionstatechange();
          } catch (e) {}
        }
        if (this.onconnectionstatechange) {
          try {
            this.onconnectionstatechange();
          } catch (e) {}
        }
      }, 0);
    }
    async setRemoteDescription(desc?: any) {
      this.remoteDescription = desc || { type: 'answer', sdp: '' };
      setTimeout(() => {
        if (this.oniceconnectionstatechange) {
          try {
            this.oniceconnectionstatechange();
          } catch (e) {}
        }
        if (this.onconnectionstatechange) {
          try {
            this.onconnectionstatechange();
          } catch (e) {}
        }
      }, 0);
    }
    async addIceCandidate(candidate?: any) {
      return;
    }
    createDataChannel(label: string) {
      return new DummyRTCDataChannel();
    }
    getSenders() {
      return [];
    }
    getReceivers() {
      return [];
    }
    getTransceivers() {
      return [];
    }
    addTrack() {}
    removeTrack() {}
    close() {
      this.connectionState = 'closed';
      this.iceConnectionState = 'closed';
    }
    addEventListener(type: string, listener: any) {
      if (type === 'icecandidate') this.onicecandidate = listener;
      if (type === 'iceconnectionstatechange') this.oniceconnectionstatechange = listener;
      if (type === 'connectionstatechange') this.onconnectionstatechange = listener;
    }
    removeEventListener() {}
  }

  g.RTCPeerConnection = DummyRTCPeerConnection;
  g.RTCSessionDescription = class RTCSessionDescription {
    type: string;
    sdp: string;
    constructor(init?: any) {
      this.type = init?.type || '';
      this.sdp = init?.sdp || '';
    }
  };
  g.RTCIceCandidate = class RTCIceCandidate {
    candidate: string;
    constructor(init?: any) {
      this.candidate = init?.candidate || '';
    }
  };

  if (!g.navigator) {
    g.navigator = {};
  }
  if (!g.navigator.userAgent) {
    g.navigator.userAgent =
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';
  }
  if (!g.navigator.mediaDevices) {
    g.navigator.mediaDevices = {};
  }

  g.navigator.mediaDevices.getUserMedia = async (constraints?: any) => {
    return new DummyMediaStream();
  };
  g.navigator.mediaDevices.enumerateDevices = async () => [
    { deviceId: 'default', groupId: 'default', kind: 'audioinput', label: 'Default Microphone' },
  ];

  if (!g.MediaStream) {
    g.MediaStream = DummyMediaStream;
  }
  if (!g.MediaStreamTrack) {
    g.MediaStreamTrack = DummyMediaStreamTrack;
  }
}

export {};
