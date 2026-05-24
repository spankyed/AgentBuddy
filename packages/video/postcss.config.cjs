const path = require('path');

module.exports = {
  plugins: {
    tailwindcss: {
      config: path.join(__dirname, '../renderer/tailwind.config.cjs'),
    },
    autoprefixer: {},
  },
};
