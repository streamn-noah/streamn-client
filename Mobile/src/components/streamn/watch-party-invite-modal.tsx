import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Modal,
  Share,
  TextInput,
  TouchableWithoutFeedback,
} from 'react-native';
import Icon from 'react-native-remix-icon';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { colors, typography, fontFamilies } from '@/constants/theme';

type WatchPartyInviteModalProps = {
  isOpen: boolean;
  onClose: () => void;
  mediaType: 'movie' | 'tv';
  mediaId: number;
  season?: number;
  episode?: number;
  title?: string;
};

export function WatchPartyInviteModal({
  isOpen,
  onClose,
  mediaType,
  mediaId,
  season = 1,
  episode = 1,
  title,
}: WatchPartyInviteModalProps) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  const [roomId] = useState(() => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
  });

  const baseUrl = process.env.EXPO_PUBLIC_API_URL || 'https://streamn.vercel.app';
  const inviteLink = `${baseUrl}/watchparty/${roomId}?mediaType=${mediaType}&mediaId=${mediaId}&s=${season}&e=${episode}`;

  const handleCopy = async () => {
    try {
      await Clipboard.setStringAsync(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy link', err);
    }
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Join my Watch Party on Streamn: ${inviteLink}`,
        title: `Join Watch Party${title ? `: ${title}` : ''}`,
      });
    } catch (err) {
      console.error('Failed to share link', err);
    }
  };

  const handleJoinNow = () => {
    onClose();
    router.push({
      pathname: '/watchparty/[id]',
      params: {
        id: roomId,
        mediaType,
        mediaId: String(mediaId),
        season: String(season),
        episode: String(episode),
        host: '1',
      },
    });
  };

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalCard}>
              {/* Close Button */}
              <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.7}>
                <Icon name="close-line" size={20} color="rgba(255,255,255,0.6)" />
              </TouchableOpacity>

              {/* Icon & Title Header */}
              <View style={styles.header}>
                <View style={styles.iconCircle}>
                  <Icon name="group-line" size={32} color="#00D2FF" />
                </View>
                <Text style={styles.title}>Create Watch Party</Text>
                <Text style={styles.subtitle}>
                  Share this link with friends to watch together in real time!
                </Text>
              </View>

              {/* Invite Link Box */}
              <View style={styles.linkContainer}>
                <TextInput
                  editable={false}
                  value={inviteLink}
                  style={styles.linkInput}
                  selectTextOnFocus
                />
                <TouchableOpacity style={styles.copyBtn} onPress={handleCopy} activeOpacity={0.8}>
                  <Icon name={copied ? "check-line" : "file-copy-line"} size={18} color="#000" />
                </TouchableOpacity>
              </View>

              {/* Action Buttons */}
              <View style={styles.actionsColumn}>
                <TouchableOpacity style={styles.shareBtn} onPress={handleShare} activeOpacity={0.8}>
                  <Icon name="share-forward-line" size={18} color="#fff" />
                  <Text style={styles.shareBtnText}>Share Invite Link</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.joinBtn} onPress={handleJoinNow} activeOpacity={0.8}>
                  <Icon name="play-fill" size={18} color="#000" style={{ marginRight: 6 }} />
                  <Text style={styles.joinBtnText}>Join Room Now</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.82)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#111115',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    padding: 24,
    alignItems: 'center',
  },
  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(0,210,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: 20,
    color: '#fff',
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: fontFamilies.bodyMedium,
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    paddingHorizontal: 8,
    lineHeight: 18,
  },
  linkContainer: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginBottom: 20,
  },
  linkInput: {
    flex: 1,
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontFamily: fontFamilies.bodyMedium,
    paddingVertical: 8,
    marginRight: 8,
  },
  copyBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionsColumn: {
    width: '100%',
    gap: 10,
  },
  shareBtn: {
    width: '100%',
    height: 46,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  shareBtnText: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: 14,
    color: '#fff',
  },
  joinBtn: {
    width: '100%',
    height: 48,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  joinBtnText: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: 15,
    color: '#000',
  },
});
