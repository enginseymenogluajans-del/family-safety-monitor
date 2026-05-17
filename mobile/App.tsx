import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { apiFetch, BACKEND_URL } from "./lib/api";

type Profile = {
  id: string;
  name: string;
  apple_id: string;
  connected: boolean;
  daily_risk_score: number;
};

export default function App() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/profiles")
      .then(setProfiles)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Family Safety Monitor</Text>
      <Text style={styles.subtitle}>{BACKEND_URL}</Text>

      {loading && <ActivityIndicator size="large" color="#2563eb" />}

      {error && <Text style={styles.error}>Bağlantı hatası: {error}</Text>}

      {!loading && !error && profiles.length === 0 && (
        <Text style={styles.empty}>Henüz profil yok.</Text>
      )}

      <FlatList
        data={profiles}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.detail}>{item.apple_id}</Text>
            <View style={styles.row}>
              <Text
                style={[
                  styles.badge,
                  item.connected ? styles.green : styles.red,
                ]}
              >
                {item.connected ? "Bağlı" : "Bağlı Değil"}
              </Text>
              <Text style={styles.risk}>Risk: {item.daily_risk_score}</Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f1f5f9",
    paddingTop: 60,
    paddingHorizontal: 16,
  },
  title: { fontSize: 22, fontWeight: "700", color: "#1e293b", marginBottom: 2 },
  subtitle: { fontSize: 12, color: "#64748b", marginBottom: 20 },
  error: { color: "#dc2626", marginTop: 12 },
  empty: { color: "#64748b", marginTop: 12 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  name: { fontSize: 16, fontWeight: "600", color: "#1e293b" },
  detail: { fontSize: 13, color: "#64748b", marginTop: 2 },
  row: { flexDirection: "row", alignItems: "center", marginTop: 8, gap: 8 },
  badge: {
    fontSize: 12,
    fontWeight: "600",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  green: { backgroundColor: "#dcfce7", color: "#16a34a" },
  red: { backgroundColor: "#fee2e2", color: "#dc2626" },
  risk: { fontSize: 12, color: "#64748b" },
});
