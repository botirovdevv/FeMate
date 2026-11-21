import { useState, type Ref } from 'react';
import { Pressable, View, type TextInput, type TextInputProps } from 'react-native';

import { useTheme } from '@/theme';
import { Icon } from './Icon';
import { KeyboardInput } from './KeyboardScreen';
import { font, Text } from './ui';
import { useT } from '@/i18n';

/** Labeled input on a soft card (reference Login). `secure` adds a show/hide eye. */
export function AuthField({
  label,
  secure,
  ref,
  ...props
}: TextInputProps & { label: string; secure?: boolean; ref?: Ref<TextInput> }) {
  const { c } = useTheme();
  const [show, setShow] = useState(false);
  const [focused, setFocused] = useState(false);
  const { t } = useT();
  return (
    <View style={{ gap: 8 }}>
      <Text variant="footnote" weight="600" style={{ fontSize: 14 }}>
        {label}
      </Text>
      <View
        style={{
          height: 54,
          borderRadius: 16,
          backgroundColor: c.card,
          borderWidth: 1,
          borderColor: focused ? c.label : c.separator,
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: 16,
          paddingRight: secure ? 4 : 16,
        }}
      >
        <KeyboardInput
          ref={ref}
          accessibilityLabel={label}
          placeholderTextColor={c.secondary}
          secureTextEntry={secure && !show}
          {...props}
          onFocus={(e) => {
            setFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            props.onBlur?.(e);
          }}
          style={[{ flex: 1, height: 52, fontSize: 16, color: c.label }, font('400')]}
        />
        {secure ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={show ? t('Hide password') : t('Show password')}
            onPress={() => setShow((v) => !v)}
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name={show ? 'eye' : 'eyeOff'} size={20} color={c.secondary} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
