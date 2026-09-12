export default {
  plugins: {
    _meta: { visibility: { database: false } },
    database: {
      hotkeys: {
        executeQuery: { key: 'Enter', modifiers: ['cmd'] }
      }
    }
  }
}
