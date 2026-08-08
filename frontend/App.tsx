import { StatusBar, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8080";

export default function App() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.container}>
        <Text style={styles.eyebrow}>LED QUATTRO</Text>
        <Text style={styles.title}>開発環境の準備ができました</Text>
        <Text style={styles.description}>
          バックエンドはSQLiteを使用します。
        </Text>
        <View style={styles.card}>
          <Text style={styles.label}>API URL</Text>
          <Text selectable style={styles.value}>
            {apiUrl}
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f4f7f5",
  },
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 28,
  },
  eyebrow: {
    color: "#32735f",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 2,
    marginBottom: 12,
  },
  title: {
    color: "#15231f",
    fontSize: 30,
    fontWeight: "700",
    lineHeight: 40,
  },
  description: {
    color: "#53645e",
    fontSize: 16,
    lineHeight: 24,
    marginTop: 12,
  },
  card: {
    backgroundColor: "#ffffff",
    borderColor: "#dce6e1",
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 32,
    padding: 20,
  },
  label: {
    color: "#71817b",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 8,
  },
  value: {
    color: "#245444",
    fontSize: 15,
  },
});
