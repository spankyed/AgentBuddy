<script setup lang="ts">
import { ref, onMounted } from 'vue';
import type { User, UserPreferences } from '@app/shared';

// Component state with typed refs
const user = ref<User | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

// Typed props
interface Props {
  userId?: string;
}

const props = defineProps<Props>();

// Load user data
const loadUser = async () => {
  loading.value = true;
  error.value = null;
  
  try {
    // This will use the typed API from preload
    const userData = await window.api.getUser(props.userId || 'current');
    user.value = userData;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load user';
  } finally {
    loading.value = false;
  }
};

// Update preferences with type safety
const updatePreferences = async (preferences: UserPreferences) => {
  if (!user.value) return;
  
  try {
    const updatedPrefs = await window.api.updatePreferences(preferences);
    user.value.preferences = updatedPrefs;
  } catch (err) {
    console.error('Failed to update preferences:', err);
  }
};

// Theme toggle with typed values
const toggleTheme = () => {
  if (!user.value) return;
  
  const currentTheme = user.value.preferences.theme;
  const newTheme: UserPreferences['theme'] = currentTheme === 'light' ? 'dark' : 'light';
  
  updatePreferences({
    ...user.value.preferences,
    theme: newTheme
  });
};

onMounted(() => {
  loadUser();
});
</script>

<template>
  <div class="user-profile">
    <div v-if="loading">Loading user data...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else-if="user" class="profile-content">
      <h2>{{ user.name }}</h2>
      <p>{{ user.email }}</p>
      
      <div class="preferences">
        <h3>Preferences</h3>
        <label>
          <span>Theme:</span>
          <button @click="toggleTheme">
            {{ user.preferences.theme === 'light' ? '☀️' : '🌙' }}
            {{ user.preferences.theme }}
          </button>
        </label>
        
        <label>
          <span>Language:</span>
          <select 
            :value="user.preferences.language"
            @change="updatePreferences({ 
              ...user.preferences, 
              language: ($event.target as HTMLSelectElement).value as UserPreferences['language']
            })"
          >
            <option value="en">English</option>
            <option value="es">Español</option>
            <option value="fr">Français</option>
            <option value="de">Deutsch</option>
          </select>
        </label>
        
        <label>
          <input 
            type="checkbox" 
            :checked="user.preferences.notifications"
            @change="updatePreferences({ 
              ...user.preferences, 
              notifications: ($event.target as HTMLInputElement).checked 
            })"
          />
          <span>Enable notifications</span>
        </label>
      </div>
    </div>
  </div>
</template>

<style scoped>
.user-profile {
  padding: 20px;
  max-width: 500px;
  margin: 0 auto;
}

.error {
  color: red;
  padding: 10px;
  background: #fee;
  border-radius: 4px;
}

.preferences {
  margin-top: 20px;
  padding: 20px;
  background: #f5f5f5;
  border-radius: 8px;
}

.preferences label {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 10px 0;
}

.preferences button {
  padding: 5px 10px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: white;
  cursor: pointer;
}

.preferences button:hover {
  background: #f0f0f0;
}

.preferences select {
  padding: 5px;
  border: 1px solid #ccc;
  border-radius: 4px;
}
</style>