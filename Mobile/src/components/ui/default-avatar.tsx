import React from 'react';
import { View } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Circle, Path } from 'react-native-svg';

export function DefaultAvatarFace({ size = 28 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, padding: 2, backgroundColor: 'rgba(255,255,255,0.15)' }}>
      <Svg viewBox="0 0 100 100" width="100%" height="100%">
        <Defs>
          <LinearGradient id="avatarGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#00A2FF" />
            <Stop offset="50%" stopColor="#0066FF" />
            <Stop offset="100%" stopColor="#9E27FF" />
          </LinearGradient>
        </Defs>
        <Circle cx="50" cy="50" r="50" fill="url(#avatarGrad)" />
        {/* Eyes */}
        <Circle cx="37" cy="46" r="4.5" fill="white" />
        <Circle cx="68" cy="46" r="4.5" fill="white" />
        {/* Smile curve */}
        <Path
          d="M 50 62 Q 62 64 72 57"
          stroke="white"
          strokeWidth="3.5"
          strokeLinecap="round"
          fill="none"
        />
      </Svg>
    </View>
  );
}
