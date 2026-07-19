import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Image, Platform } from 'react-native';
import { useAuth } from '@/components/providers/auth-provider';
import { Sheet } from '@/components/ui/sheet';
import Icon from 'react-native-remix-icon';
import { colors, typography } from '@/constants/theme';
import Svg, { Path } from 'react-native-svg';

export function AuthSheet() {
  const {
    authSheetVisible,
    setAuthSheetVisible,
    authBusy,
    errorMessage,
    handleGoogleSignIn,
    handleGuestSignIn
  } = useAuth();

  return (
    <Sheet visible={authSheetVisible} onClose={() => setAuthSheetVisible(false)}>
      <View style={styles.sheetHeader}>
        <View style={styles.appIconContainer}>
          <Svg width={32} height={42} viewBox="0 0 173 224" fill="none">
            <Path
              d="M0 159.796V223.806L172.039 170.786L68.1895 138.781L0 159.796Z"
              fill="#555555"
            />
            <Path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M102.732 85.4172L0.000167847 53.7568V117.766L68.1895 138.781L172.039 170.786L172.195 170.834V106.825L172.195 106.728L172.039 106.777L102.732 85.4172Z"
              fill="#2a2a2a"
            />
            <Path
              d="M172.195 0L0 53.068L0.000167847 117.766V53.7568L102.732 85.4172L172.195 64.0095V0Z"
              fill="#555555"
            />
          </Svg>
        </View>
        <Text style={styles.sheetTitle}>Sign in to Streamn</Text>
        <Text style={styles.sheetSubtitle}>
          Sync your custom watchlists, watch history, and likes across all your devices.
        </Text>
      </View>

      {errorMessage && (
        <View style={styles.errorContainer}>
          <Icon name="error-warning-line" size={16} color={colors.danger} />
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      )}

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.oauthButton, authBusy && styles.disabledButton]}
          onPress={handleGoogleSignIn}
          disabled={authBusy}
          activeOpacity={0.8}
        >
          {authBusy ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <>
              <Image
                source={{ uri: "https://www.google.com/favicon.ico" }}
                style={styles.googleIcon}
              />
              <Text style={styles.oauthButtonText}>Continue with Google</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.guestButton, authBusy && styles.disabledButton]}
          onPress={handleGuestSignIn}
          disabled={authBusy}
          activeOpacity={0.8}
        >
          {authBusy ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Icon name="user-follow-line" size={20} color="#fff" style={{ marginRight: 10 }} />
              <Text style={styles.guestButtonText}>Quick Guest Sign-in</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => setAuthSheetVisible(false)}
          disabled={authBusy}
          activeOpacity={0.8}
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  sheetHeader: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  appIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
  },
  sheetTitle: {
    ...typography.headline,
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  sheetSubtitle: {
    ...typography.body,
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,59,48,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,59,48,0.2)',
    padding: 12,
    borderRadius: 12,
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
  },
  errorText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  buttonContainer: {
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 20 : 10,
    marginTop: 16,
  },
  oauthButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    height: 52,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  googleIcon: {
    width: 20,
    height: 20,
    marginRight: 12,
  },
  oauthButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
  guestButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    height: 52,
    borderRadius: 16,
  },
  guestButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  cancelButton: {
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButtonText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.5,
  },
});
