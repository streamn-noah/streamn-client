import { Room } from 'livekit-client';

export type WatchPartyParticipant = {
  identity: string;
  name: string;
  joinedAt: number;
  isHost: boolean;
};

export class WatchPartySession {
  room: Room;
  signalClient: any;
  localIdentity: string;
  localName: string;
  roomName: string;
  participants: WatchPartyParticipant[] = [];

  onParticipantsChange?: (list: WatchPartyParticipant[]) => void;
  onDataReceived?: (data: any, senderIdentity: string) => void;
  onDisconnected?: () => void;

  constructor(roomName: string, identity: string, name: string) {
    this.room = new Room();
    this.signalClient = (this.room.engine as any)?.client;
    this.roomName = roomName;
    this.localIdentity = identity;
    this.localName = name;
  }

  async connect(serverUrl: string, token: string, isHost: boolean) {
    if (!this.signalClient) {
      throw new Error('SignalClient not available on Room engine');
    }

    // Join LiveKit SFU via pure WebSocket SignalClient
    const res = await this.signalClient.join(serverUrl, token, {
      autoSubscribe: false,
    } as any);

    const localP: WatchPartyParticipant = {
      identity: res.participant?.identity || this.localIdentity,
      name: res.participant?.name || this.localName,
      joinedAt: Date.now(),
      isHost,
    };

    const list: WatchPartyParticipant[] = [localP];
    if (res.otherParticipants) {
      for (const p of res.otherParticipants) {
        if (p.identity !== localP.identity) {
          list.push({
            identity: p.identity,
            name: p.name || p.identity,
            joinedAt: Date.now(),
            isHost: false,
          });
        }
      }
    }

    this.participants = list;
    if (this.onParticipantsChange) {
      this.onParticipantsChange([...this.participants]);
    }

    // Handle Participant Join/Leave updates
    this.signalClient.onParticipantUpdate = (updates: any[]) => {
      for (const u of updates) {
        if (u.state === 2) {
          // Disconnected
          this.participants = this.participants.filter((p) => p.identity !== u.identity);
        } else if (!this.participants.some((p) => p.identity === u.identity)) {
          this.participants.push({
            identity: u.identity,
            name: u.name || u.identity,
            joinedAt: Date.now(),
            isHost: false,
          });
        }
      }
      if (this.onParticipantsChange) {
        this.onParticipantsChange([...this.participants]);
      }
    };

    // Handle Data Received
    this.signalClient.onDataReceived = (payload: Uint8Array, participant: any) => {
      try {
        const jsonStr = new TextDecoder().decode(payload);
        const data = JSON.parse(jsonStr);
        if (this.onDataReceived) {
          this.onDataReceived(data, participant?.identity || '');
        }
      } catch (e) {}
    };

    // Handle Disconnect
    this.signalClient.onClose = () => {
      if (this.onDisconnected) {
        this.onDisconnected();
      }
    };
  }

  sendData(dataObj: object) {
    try {
      const jsonStr = JSON.stringify(dataObj);
      const encoder = new TextEncoder();
      const payload = encoder.encode(jsonStr);
      this.signalClient.sendData({
        payload,
        kind: 0,
        destinationIdentities: [],
      });
    } catch (e) {}
  }

  disconnect() {
    try {
      this.signalClient.close();
    } catch (e) {}
  }
}
