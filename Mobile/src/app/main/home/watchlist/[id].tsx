import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Dimensions,
  Share,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Icon from 'react-native-remix-icon';
import { useAuth } from '@/components/providers/auth-provider';
import { colors, typography } from '@/constants/theme';
import { tmdbImage } from '@/services/media';
import {
  getWatchlist,
  createWatchlistInvite,
  updateWatchlist,
  deleteWatchlist,
  getUserProfile,
} from '@/services/supabase';
import { DefaultAvatarFace } from '@/components/ui/default-avatar';
import { Sheet } from '@/components/ui/sheet';

const { width } = Dimensions.get('window');
const GRID_SPACING = 12;
const COLUMN_WIDTH = (width - 32 - GRID_SPACING) / 2; // 2 columns grid

export default function WatchlistDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [watchlist, setWatchlist] = useState<any | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [showUsersModal, setShowUsersModal] = useState(false);

  useEffect(() => {
    async function loadWatchlistData() {
      if (!id) return;
      try {
        const data = await getWatchlist(id);
        if (data) {
          setWatchlist(data);
          setItems(data.watchlist_items || []);
          setIsOwner(user ? data.user_id === user.id : false);

          const ownerId = data.user_id;
          const ownerProfile = data.profiles ? { ...data.profiles, id: ownerId } : null;

          let memberProfiles: any[] = [];
          if (ownerProfile) {
            memberProfiles.push(ownerProfile);
          }

          if (user && user.id !== ownerId) {
            const myProfile = await getUserProfile();
            if (myProfile && !memberProfiles.some((p) => p.id === user.id)) {
              memberProfiles.push({ ...myProfile, id: user.id });
            }
          }

          setProfiles(memberProfiles);
        } else {
          Alert.alert('Error', 'Watchlist not found or has been deleted.');
          router.back();
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    loadWatchlistData();
  }, [id, user]);

  const handlePlayAll = () => {
    if (items.length === 0) return;
    const firstItem = items[0];
    if (firstItem.media_type === 'movie') {
      router.push(`/player/movie/${firstItem.media_id}` as any);
    } else {
      router.push(`/player/tv/${firstItem.media_id}?season=1&episode=1` as any);
    }
  };

  const handleShare = async () => {
    if (!watchlist) return;
    try {
      const inviteId = await createWatchlistInvite(watchlist.id);
      if (inviteId) {
        const webUrl = `${process.env.EXPO_PUBLIC_API_URL || 'https://streamn.vercel.app'}/invite/${inviteId}`;
        await Share.share({
          message: `Join my watchlist "${watchlist.name}" on Streamn! ${webUrl}`,
          url: webUrl,
        });
      } else {
        Alert.alert('Error', 'Failed to create invite link.');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleTogglePrivacy = async () => {
    if (!watchlist || updating) return;
    setUpdating(true);
    const newPrivacy = watchlist.privacy === 'public' ? 'private' : 'public';
    const ok = await updateWatchlist(watchlist.id, { privacy: newPrivacy });
    if (ok) {
      setWatchlist((prev: any) => ({ ...prev, privacy: newPrivacy }));
    } else {
      Alert.alert('Error', 'Failed to update watchlist privacy.');
    }
    setUpdating(false);
  };

  const handleDelete = () => {
    if (!watchlist) return;
    Alert.alert('Delete Watchlist', `Are you sure you want to delete "${watchlist.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const ok = await deleteWatchlist(watchlist.id);
          if (ok) {
            router.back();
          } else {
            Alert.alert('Error', 'Failed to delete watchlist.');
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  if (!watchlist) return null;

  const firstItem = items[0];
  const backdropUrl = firstItem?.poster_path || firstItem?.backdrop_path;

  const renderGridItem = ({ item }: { item: any }) => {
    const poster = item.poster_path;
    const mediaType = item.media_type;
    const mediaId = item.media_id;
    const title = item.title;

    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => router.push(`/main/home/detail/${mediaType}/${mediaId}`)}
        style={styles.gridItem}
      >
        <View style={styles.gridItemImageContainer}>
          {poster ? (
            <Image
              source={{ uri: tmdbImage(poster, 'w300') }}
              style={styles.gridItemImage}
              contentFit="cover"
            />
          ) : (
            <View style={styles.gridItemEmptyImage}>
              <Icon name="film-line" size={28} color="rgba(255,255,255,0.2)" />
              <Text style={styles.gridItemEmptyText} numberOfLines={2}>
                {title}
              </Text>
            </View>
          )}

          {/* Hover-like Play overlay */}
          <View style={styles.gridItemPlayOverlay}>
            <View style={styles.playOverlayCircle}>
              <Icon name="play-fill" size={24} color="#000" style={{ marginLeft: 2 }} />
            </View>
          </View>
        </View>

        <Text style={styles.gridItemTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.gridItemSubtitle}>
          {mediaType === 'movie' ? 'Movie' : 'Series'}{item.year ? ` · ${item.year}` : ''}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Scrollable Content */}
      <FlatList
        data={items}
        renderItem={renderGridItem}
        keyExtractor={(item) => `detail-item-${item.id}`}
        numColumns={2}
        columnWrapperStyle={styles.columnWrapper}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.headerContainer}>
            {/* Hero Backdrop */}
            <View style={styles.heroBackdrop}>
              {backdropUrl ? (
                <Image
                  source={{ uri: tmdbImage(backdropUrl, 'w500') }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                />
              ) : (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: '#1A1A1A' }]} />
              )}
              <BlurView intensity={70} tint="dark" style={StyleSheet.absoluteFill} />
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.6)', '#000000']}
                style={StyleSheet.absoluteFill}
                locations={[0, 0.5, 1]}
              />
            </View>

            {/* Back Button Overlay */}
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <Icon name="arrow-left-line" size={24} color="#fff" />
            </TouchableOpacity>

            {/* Watchlist Details Metadata */}
            <View style={styles.detailsContainer}>
              <Text style={styles.watchlistTitle} numberOfLines={2}>
                {watchlist.name}
              </Text>

              <View style={styles.metaRow}>
                {watchlist.profiles?.display_name && (
                  <>
                    <Text style={styles.metaText}>Created by {watchlist.profiles.display_name}</Text>
                    <Text style={styles.dot}>•</Text>
                  </>
                )}
                <Text style={styles.metaText}>
                  {items.length} item{items.length === 1 ? '' : 's'}
                </Text>
              </View>

              {watchlist.description && (
                <Text style={styles.descriptionText} numberOfLines={3}>
                  {watchlist.description}
                </Text>
              )}
            </View>

            {/* Controls Bar */}
            <View style={styles.controlsBar}>
              <View style={styles.playAndAvatarsRow}>
                <TouchableOpacity
                  style={[styles.playBtn, items.length === 0 && styles.playBtnDisabled]}
                  onPress={handlePlayAll}
                  disabled={items.length === 0}
                  activeOpacity={0.8}
                >
                  <Icon name="play-fill" size={24} color="#000" style={{ marginLeft: 2 }} />
                </TouchableOpacity>

                {/* Stacked Avatar List - Only shown for Private Watchlists */}
                {watchlist.privacy === 'private' && profiles.length > 0 && (
                  <TouchableOpacity
                    style={styles.avatarStack}
                    onPress={() => setShowUsersModal(true)}
                    activeOpacity={0.8}
                  >
                    {profiles.slice(0, 4).map((p, i) => (
                      <View
                        key={p.id}
                        style={[
                          styles.stackedAvatar,
                          { zIndex: 10 - i, marginLeft: i === 0 ? 0 : -12 },
                        ]}
                      >
                        {p.avatar_url ? (
                          <Image source={{ uri: p.avatar_url }} style={styles.avatarImage} />
                        ) : (
                          <DefaultAvatarFace size={28} />
                        )}
                      </View>
                    ))}
                    {profiles.length > 4 && (
                      <View style={[styles.stackedAvatar, styles.avatarMore, { zIndex: 5, marginLeft: -12 }]}>
                        <Text style={styles.avatarMoreText}>+{profiles.length - 4}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.secondaryActions}>
                <TouchableOpacity
                  style={styles.actionIconBtn}
                  onPress={handleShare}
                  activeOpacity={0.8}
                >
                  <Icon name="share-box-line" size={20} color="#fff" />
                </TouchableOpacity>

                {isOwner && (
                  <>
                    <TouchableOpacity
                      style={styles.actionIconBtn}
                      onPress={handleTogglePrivacy}
                      disabled={updating}
                      activeOpacity={0.8}
                    >
                      <Icon
                        name={watchlist.privacy === 'public' ? 'global-line' : 'lock-line'}
                        size={20}
                        color="#fff"
                      />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.actionIconBtn, styles.deleteActionBtn]}
                      onPress={handleDelete}
                      activeOpacity={0.8}
                    >
                      <Icon name="delete-bin-line" size={20} color={colors.danger} />
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>This watchlist is empty</Text>
            <Text style={styles.emptySubtitle}>Add some movies or shows to get started.</Text>
          </View>
        }
      />

      {/* WATCHLIST MEMBERS MODAL */}
      <Sheet visible={showUsersModal} onClose={() => setShowUsersModal(false)}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetModalTitle}>Watchlist Members</Text>
          <Text style={styles.sheetModalSubtitle}>
            {profiles.length} user{profiles.length === 1 ? '' : 's'} connected to this watchlist
          </Text>
        </View>

        <View style={styles.userList}>
          {profiles.map((p) => {
            const isCreator = p.id === watchlist.user_id;
            return (
              <View key={p.id} style={styles.userRow}>
                {p.avatar_url ? (
                  <Image source={{ uri: p.avatar_url }} style={styles.userAvatar} />
                ) : (
                  <View style={styles.userAvatarFallback}>
                    <DefaultAvatarFace size={40} />
                  </View>
                )}
                <View style={styles.userInfo}>
                  <Text style={styles.userName} numberOfLines={1}>
                    {p.display_name || 'User'}
                  </Text>
                  <Text style={styles.userRoleText}>
                    {isCreator ? 'Creator & Owner' : 'Member'}
                  </Text>
                </View>
                {isCreator && (
                  <View style={styles.ownerBadge}>
                    <Text style={styles.ownerBadgeText}>Owner</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        <TouchableOpacity
          style={styles.sheetCloseBtn}
          onPress={() => setShowUsersModal(false)}
          activeOpacity={0.8}
        >
          <Text style={styles.sheetCloseBtnText}>Close</Text>
        </TouchableOpacity>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  columnWrapper: {
    paddingHorizontal: 16,
    justifyContent: 'space-between',
  },
  headerContainer: {
    marginBottom: 20,
  },
  heroBackdrop: {
    height: 340,
    width: '100%',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  backButton: {
    position: 'absolute',
    top: 60,
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  detailsContainer: {
    paddingHorizontal: 16,
    paddingTop: 160,
  },
  watchlistTitle: {
    ...typography.displayLarge,
    fontSize: 32,
    lineHeight: 38,
    color: '#fff',
    fontWeight: '900',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  metaText: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
  },
  dot: {
    color: 'rgba(255,255,255,0.4)',
    marginHorizontal: 8,
  },
  descriptionText: {
    ...typography.body,
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 12,
    lineHeight: 20,
  },
  controlsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginTop: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  playBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playBtnDisabled: {
    opacity: 0.5,
  },
  playAndAvatarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarStack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stackedAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#000',
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarMore: {
    backgroundColor: '#222',
  },
  avatarMoreText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
    fontWeight: 'bold',
  },
  secondaryActions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteActionBtn: {
    backgroundColor: 'rgba(255,59,48,0.06)',
    borderColor: 'rgba(255,59,48,0.15)',
  },
  gridItem: {
    width: COLUMN_WIDTH,
    marginBottom: 20,
  },
  gridItemImageContainer: {
    width: COLUMN_WIDTH,
    height: COLUMN_WIDTH * 1.4,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  gridItemImage: {
    width: '100%',
    height: '100%',
  },
  gridItemEmptyImage: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 10,
  },
  gridItemEmptyText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
  },
  gridItemPlayOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    opacity: 0, // Wait, since hover is not on mobile, we can let click trigger detail, and not use hover opacity
  },
  playOverlayCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridItemTitle: {
    ...typography.bodyBold,
    fontSize: 14,
    color: '#fff',
    marginTop: 8,
    paddingHorizontal: 2,
  },
  gridItemSubtitle: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    marginTop: 2,
    paddingHorizontal: 2,
  },
  emptyContainer: {
    paddingVertical: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    ...typography.title,
    fontSize: 18,
    color: '#fff',
    marginBottom: 6,
  },
  emptySubtitle: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.4)',
  },
  sheetHeader: {
    marginBottom: 4,
  },
  sheetModalTitle: {
    ...typography.title,
    fontSize: 20,
    color: '#fff',
    fontWeight: '800',
  },
  sheetModalSubtitle: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 4,
  },
  userList: {
    gap: 12,
    marginTop: 8,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  userAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#333',
  },
  userAvatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#333',
  },
  userInfo: {
    flex: 1,
    marginLeft: 14,
  },
  userName: {
    ...typography.bodyBold,
    fontSize: 16,
    color: '#fff',
  },
  userRoleText: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    marginTop: 2,
  },
  ownerBadge: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  ownerBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  sheetCloseBtn: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  sheetCloseBtnText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '700',
  },
});
