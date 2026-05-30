export const launchFilmStory = {
  persona: {
    name: 'Sam',
    role: 'solo indie hacker',
    project: 'Supafan',
    currentWork: 'checkout flow',
  },
  threads: {
    checkoutImplementation: {
      id: 'thread-checkout-flow-implementation',
      title: 'Checkout flow implementation',
      shortCode: 'AB-42',
    },
    stripePaymentIntegration: {
      id: 'thread-stripe-payment-integration',
      title: 'Stripe payment integration',
      shortCode: 'AB-47',
    },
    deployChecklist: {
      id: 'thread-deploy-checklist',
      title: 'Deploy checklist',
      shortCode: 'AB-53',
    },
    addDiscountCodeSupport: {
      id: 'thread-add-discount-code-support',
      title: 'Add discount code support',
    },
    receiptEmailTemplates: {
      id: 'thread-receipt-email-templates',
      title: 'Receipt email templates',
    },
  },
  branch: 'sam/checkout-flow',
  baseBranch: 'main',
  projectPath: '~/Supafan',
  repo: 'supafan/supafan',
  author: 'sam',
  command: '/supafan deploy-checkout',
  flow: {
    id: 'flow-deploy-checkout',
    title: 'Deploy Checkout',
    switchLabel: 'is /supafan deploy-checkout',
    actionLabels: {
      migrations: 'Run database migrations',
      notify: 'Notify #releases channel',
    },
  },
} as const;
