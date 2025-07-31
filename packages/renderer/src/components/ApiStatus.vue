<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { trpc, getConnectionStatus } from '@app/preload';

// Type definition (temporary until shared types are set up)
interface WsConnectionStatus {
  connected: boolean;
  reconnecting: boolean;
  lastError?: string;
  reconnectAttempts: number;
}

// Connection status
const connectionStatus = ref<WsConnectionStatus>(getConnectionStatus());
const testResult = ref<string>('');
const loading = ref(false);

// Update connection status when it changes
const handleConnectionStatus = (event: Event) => {
  const customEvent = event as CustomEvent<WsConnectionStatus>;
  connectionStatus.value = customEvent.detail;
};

// Test API call
const testApi = async () => {
  loading.value = true;
  testResult.value = '';
  
  try {
    // Test a simple API call - you'll need to adjust this based on your actual API
    // For now, just test the connection status
    testResult.value = `Connection Status: ${JSON.stringify(connectionStatus.value, null, 2)}`;
  } catch (error) {
    testResult.value = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  window.addEventListener('trpc-connection-status', handleConnectionStatus);
});

onUnmounted(() => {
  window.removeEventListener('trpc-connection-status', handleConnectionStatus);
});
</script>

<template>
  <div class="api-status">
    <h3>API Server Status</h3>
    
    <div class="status-indicator">
      <span class="status-dot" :class="{ 
        'connected': connectionStatus.connected,
        'disconnected': !connectionStatus.connected && !connectionStatus.reconnecting,
        'reconnecting': connectionStatus.reconnecting
      }"></span>
      <span>
        {{ connectionStatus.connected ? 'Connected' : 
           connectionStatus.reconnecting ? 'Reconnecting...' : 'Disconnected' }}
      </span>
      <span v-if="connectionStatus.reconnecting" class="reconnect-info">
        (Attempt {{ connectionStatus.reconnectAttempts }})
      </span>
    </div>
    
    <div v-if="connectionStatus.lastError" class="error-message">
      Last error: {{ connectionStatus.lastError }}
    </div>
    
    <div class="test-section">
      <button 
        @click="testApi" 
        :disabled="!connectionStatus.connected || loading"
        class="test-button"
      >
        {{ loading ? 'Testing...' : 'Test API Call' }}
      </button>
      
      <pre v-if="testResult" class="test-result">{{ testResult }}</pre>
    </div>
  </div>
</template>

<style scoped>
.api-status {
  padding: 20px;
  background: #f5f5f5;
  border-radius: 8px;
  margin: 20px 0;
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 10px 0;
}

.status-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  transition: background-color 0.3s;
}

.status-dot.connected {
  background-color: #4caf50;
}

.status-dot.disconnected {
  background-color: #f44336;
}

.status-dot.reconnecting {
  background-color: #ff9800;
  animation: pulse 1s infinite;
}

@keyframes pulse {
  0% { opacity: 1; }
  50% { opacity: 0.5; }
  100% { opacity: 1; }
}

.reconnect-info {
  color: #666;
  font-size: 0.9em;
}

.error-message {
  color: #f44336;
  padding: 10px;
  background: #ffebee;
  border-radius: 4px;
  margin: 10px 0;
}

.test-section {
  margin-top: 20px;
}

.test-button {
  padding: 8px 16px;
  background: #2196f3;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.3s;
}

.test-button:hover:not(:disabled) {
  background: #1976d2;
}

.test-button:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.test-result {
  margin-top: 10px;
  padding: 10px;
  background: #f0f0f0;
  border-radius: 4px;
  overflow-x: auto;
  font-size: 0.85em;
}
</style>