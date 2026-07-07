<template>
  <div class="login">
    <h1>Login</h1>
    <input v-model="email" placeholder="Email" />
    <input v-model="password" placeholder="Password" type="password" />
    <button @click="login">Login</button>
  </div>
</template>

<script>
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";

export default {
  data() {
    return {
      email: "",
      password: ""
    };
  },
  methods: {
    async login() {
      const auth = getAuth();
      try {
        await signInWithEmailAndPassword(auth, this.email, this.password);
        alert("Login berhasil!");
        this.$router.push("/"); // arahkan ke halaman utama
      } catch (error) {
        alert("Login gagal: " + error.message);
      }
    }
  }
};
</script>

<style scoped>
.login {
  display: flex;
  flex-direction: column;
  width: 300px;
  margin: 100px auto;
}
.login input {
  margin-bottom: 10px;
  padding: 8px;
}
.login button {
  padding: 10px;
}
</style>