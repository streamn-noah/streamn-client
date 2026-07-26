import React from 'react';
import { Text, TextInput } from 'react-native';

const defaultTextStyle = {
  fontFamily: 'Aeonik-Medium',
  letterSpacing: -0.44,
};

// Global defaultProps patch for Text
if ((Text as any).defaultProps) {
  (Text as any).defaultProps.style = [
    defaultTextStyle,
    (Text as any).defaultProps.style,
  ];
} else {
  (Text as any).defaultProps = {
    style: defaultTextStyle,
  };
}

// Global defaultProps patch for TextInput
if ((TextInput as any).defaultProps) {
  (TextInput as any).defaultProps.style = [
    defaultTextStyle,
    (TextInput as any).defaultProps.style,
  ];
} else {
  (TextInput as any).defaultProps = {
    style: defaultTextStyle,
  };
}

export {};
