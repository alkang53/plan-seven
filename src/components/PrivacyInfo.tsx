import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { styles } from '../styles/appStyles';

type Props = {
  firstUse?: boolean;
  onClose: () => void;
};

export function PrivacyInfo({ firstUse = false, onClose }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.modalRoot}>
      <View style={[styles.infoCard, { paddingBottom: 26 + insets.bottom }]}>
        <View style={styles.modalHeader}>
          <View style={styles.infoTitleBlock}>
            <Text style={styles.modalTitle}>{firstUse ? 'Hoşgeldin' : 'Gizlilik ve Ayarlar'}</Text>
          </View>
          {!firstUse && (
            <Pressable accessibilityLabel="Gizlilik ekranını kapat" accessibilityRole="button" onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          )}
        </View>

        <ScrollView contentContainerStyle={styles.infoContent} showsVerticalScrollIndicator={false}>
          {firstUse && <Text style={styles.infoLead}>Plan Seven, planlarını cihazında tutar ve verilerini uzak bir sunucuya göndermez.</Text>}
          <Text style={styles.infoSectionTitle}>Verilerin nerede?</Text>
          <Text style={styles.infoText}>Görevlerin yalnızca bu cihazdaki yerel depolama alanında saklanır. Hesap açman veya bir sunucuya bağlanman gerekmez.</Text>
          <Text style={styles.infoSectionTitle}>Verileri silme</Text>
          <Text style={styles.infoText}>Görevleri uygulama içindeki silme işlemiyle tek tek kaldırabilirsin. Uygulamayı cihazından sildiğinde, bu cihazda tutulan yerel görev verileri de silinir.</Text>
          <Text style={styles.infoSectionTitle}>Gelecekteki senkronizasyon</Text>
          <Text style={styles.infoText}>Takvim veya başka bir hizmetle senkronizasyon şu anda etkin değildir. İleride eklenirse yalnızca senin açık iznin ve bağlantınla çalışacaktır.</Text>
        </ScrollView>

        <Pressable accessibilityRole="button" onPress={onClose} style={({ pressed }) => [styles.submitButton, pressed && styles.submitPressed]}>
          <Text style={styles.submitText}>{firstUse ? 'Anladım' : 'Kapat'}</Text>
        </Pressable>
      </View>
    </View>
  );
}
