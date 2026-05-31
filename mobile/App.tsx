import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { apiFetch, BACKEND_URL } from "./lib/api";

export default function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={["#0a001a", "#290066", "#0a001a"]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
      
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        <View style={styles.glassContainer}>
          <BlurView intensity={20} tint="dark" style={styles.blurView}>
            <Text style={styles.logo}>SPACE</Text>
            <Text style={styles.welcomeText}>Welcome Back</Text>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Email address</Text>
              <TextInput
                style={styles.input}
                placeholder="example@gmail.com"
                placeholderTextColor="#a0a0a0"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                placeholder="•••••••••••••"
                placeholderTextColor="#a0a0a0"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
            </View>

            <TouchableOpacity style={styles.forgotPasswordContainer}>
              <Text style={styles.forgotPasswordText}>Forget Password ?</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.loginButton}
              onPress={() => {}}
              disabled={loading}
            >
              <LinearGradient
                colors={["#5b21b6", "#7c3aed"]}
                style={styles.loginGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={styles.loginButtonText}>Login</Text>
              </LinearGradient>
            </TouchableOpacity>

            <View style={styles.signupContainer}>
              <Text style={styles.signupText}>
                Are You New Member ? <Text style={styles.signupLink}>Sign UP</Text>
              </Text>
            </View>
          </BlurView>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a001a",
  },
  keyboardView: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  glassContainer: {
    width: "100%",
    maxWidth: 400,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  blurView: {
    padding: 30,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  logo: {
    fontSize: 32,
    color: "#fff",
    textAlign: "center",
    letterSpacing: 2,
    fontWeight: "600",
    marginBottom: 20,
    fontFamily: Platform.OS === "ios" ? "Helvetica Neue" : "sans-serif",
  },
  welcomeText: {
    fontSize: 24,
    color: "#fff",
    textAlign: "center",
    marginBottom: 30,
    fontWeight: "400",
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    color: "#e2e8f0",
    marginBottom: 8,
    fontSize: 14,
  },
  input: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.6)",
    borderRadius: 10,
    padding: 15,
    color: "#fff",
    fontSize: 16,
  },
  forgotPasswordContainer: {
    alignSelf: "flex-start",
    marginBottom: 25,
  },
  forgotPasswordText: {
    color: "#e2e8f0",
    fontSize: 14,
  },
  loginButton: {
    borderRadius: 10,
    overflow: "hidden",
    marginBottom: 30,
  },
  loginGradient: {
    paddingVertical: 15,
    alignItems: "center",
  },
  loginButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
  signupContainer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 20,
  },
  signupText: {
    color: "#e2e8f0",
    fontSize: 14,
  },
  signupLink: {
    color: "#fff",
    fontWeight: "bold",
  },
});
