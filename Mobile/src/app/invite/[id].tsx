import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Alert,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useAuth } from '@/components/providers/auth-provider';
import { colors, typography } from '@/constants/theme';
import Icon from 'react-native-remix-icon';
import { tmdbImage } from '@/services/media';
import { getWatchlistInvite, acceptWatchlistInvite } from '@/services/supabase';

const { width } = Dimensions.get('window');

export default function InviteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user, showGoogleSignIn } = useAuth();

  const [invite, setInvite] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(false);

  const loadInvite = async () => {
    if (!id) return;
    try {
      const data = await getWatchlistInvite(id);
      setInvite(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInvite();
  }, [id]);

  const handleAccept = async () => {
    if (!user) {
      // Trigger sign-in flow and accept on success
      showGoogleSignIn(() => {
        handleAccept();
      });
      return;
    }

    setBusy(true);
    try {
      const ok = await acceptWatchlistInvite(id);
      if (ok) {
        setAccepted(true);
        Alert.alert('Success', 'Watchlist added to your library!');
        setTimeout(() => {
          router.replace('/main/account');
        }, 1000);
      } else {
        Alert.alert('Error', 'Failed to accept invite. It may have expired.');
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'An error occurred.');
    } finally {
      setBusy(false);
    }
  };

  const handleDecline = () => {
    router.replace('/main/home');
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  // Handle invalid/expired invite
  if (!invite || !invite.watchlists) {
    return (
      <View style={styles.centerContainer}>
        <View style={styles.card}>
          <View style={styles.errorIconContainer}>
            <Icon name="close-circle-line" size={40} color={colors.danger} />
          </View>
          <Text style={styles.cardTitle}>Invite Invalid</Text>
          <Text style={styles.cardText}>
            This watchlist invite link is no longer valid, has expired, or the watchlist was deleted.
          </Text>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => router.replace('/main/home')}
          >
            <Text style={styles.actionBtnText}>Go to Home</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const list = invite.watchlists;
  const items = list.watchlist_items || [];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      {/* Invite Preview Info */}
      <View style={styles.inviteHeader}>
        <Icon name="mail-send-line" size={32} color="#fff" style={{ marginBottom: 12 }} />
        <Text style={styles.inviteLabel}>You've Been Invited to Join</Text>
        <Text style={styles.watchlistName}>{list.name}</Text>
        {list.description && (
          <Text style={styles.watchlistDescription}>{list.description}</Text>
        )}
        <Text style={styles.itemCount}>
          {items.length} item{items.length === 1 ? '' : 's'} to check out
        </Text>
      </View>

      {/* Item Preview Row */}
      {items.length > 0 && (
        <View style={styles.previewContainer}>
          <Text style={styles.previewTitle}>Titles in this List</Text>
          <FlatList
            data={items}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item) => `invite-item-${item.id}`}
            renderItem={({ item }) => (
              <View style={styles.previewCard}>
                {item.poster_path ? (
                  <Image
                    source={{ uri: tmdbImage(item.poster_path, 'w200') }}
                    style={styles.previewCardImage}
                    contentFit="cover"
                  />
                ) : (
                  <View style={styles.previewCardImageEmpty}>
                    <Icon name="film-line" size={20} color="rgba(255,255,255,0.2)" />
                  </View>
                )}
                <Text style={styles.previewCardTitle} numberOfLines={1}>
                  {item.title}
                </Text>
              </View>
            )}
            contentContainerStyle={styles.listPadding}
          />
        </View>
      )}

      {/* Accept / Decline CTA */}
      <View style={styles.actions}>
        {accepted ? (
          <View style={styles.acceptedBadge}>
            <Icon name="checkbox-circle-fill" size={20} color="#2EAF62" />
            <Text style={styles.acceptedText}>Added to Library!</Text>
          </View>
        ) : (
          <>
            <TouchableOpacity
              style={styles.acceptBtn}
              onPress={handleAccept}
              disabled={busy}
              activeOpacity={0.8}
            >
              {busy ? (
                <ActivityIndicator size="small" color="#000" />
              ) : (
                <Text style={styles.acceptBtnText}>
                  {user ? 'Accept Invite' : 'Sign In to Accept'}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.declineBtn}
              onPress={handleDecline}
              disabled={busy}
              activeOpacity={0.8}
            >
              <Text style={styles.declineBtnText}>Decline</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  scrollContent: {
    paddingTop: 80,
    paddingBottom: 40,
  },
  centerContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    backgroundColor: '#111',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    padding: 28,
    alignItems: 'center',
  },
  errorIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,59,48,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  cardTitle: {
    ...typography.title,
    fontSize: 22,
    color: '#fff',
    marginBottom: 10,
    textAlign: 'center',
  },
  cardText: {
    ...typography.body,
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 28,
  },
  actionBtn: {
    backgroundColor: '#fff',
    paddingHorizontal: 24,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
  },
  actionBtnText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '700',
  },
  inviteHeader: {
    alignItems: 'center',
    paddingHorizontal: 24,
    marginBottom: 36,
  },
  inviteLabel: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.4)',
    textTransform: 'uppercase',
    fontWeight: 'bold',
    marginBottom: 8,
  },
  watchlistName: {
    ...typography.headline,
    fontSize: 28,
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
  },
  watchlistDescription: {
    ...typography.body,
    fontSize: 15,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  itemCount: {
    ...typography.caption,
    fontSize: 13,
    color: 'rgba(255,255,255,0.3)',
    marginTop: 8,
  },
  previewContainer: {
    marginBottom: 36,
  },
  previewTitle: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.4)',
    textTransform: 'uppercase',
    fontWeight: 'bold',
    paddingHorizontal: 24,
    marginBottom: 14,
  },
  listPadding: {
    paddingHorizontal: 20,
  },
  previewCard: {
    width: 100,
    marginHorizontal: 4,
  },
  previewCardImage: {
    width: 100,
    height: 140,
    borderRadius: 8,
    backgroundColor: '#222',
  },
  previewCardImageEmpty: {
    width: 100,
    height: 140,
    borderRadius: 8,
    backgroundColor: '#222',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewCardTitle: {
    ...typography.bodyBold,
    fontSize: 12,
    color: '#fff',
    marginTop: 6,
    paddingHorizontal: 2,
  },
  actions: {
    paddingHorizontal: 24,
    gap: 12,
  },
  acceptBtn: {
    backgroundColor: '#fff',
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  acceptBtnText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
  declineBtn: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  declineBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  acceptedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(46,175,98,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(46,175,98,0.2)',
    borderRadius: 16,
    height: 52,
    gap: 8,
  },
  acceptedText: {
    color: '#2EAF62',
    fontSize: 16,
    fontWeight: '700',
  },
});
