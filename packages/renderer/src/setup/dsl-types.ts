import { registerDslType } from '@abuddy/sdk/fe/components/monaco-config'

import actionSchema from '../../../api/dist/defs/monaco/action-defs.d.ts?raw'
import promptSchema from '../../../api/dist/defs/monaco/prompt-defs.d.ts?raw'
import databaseSchema from '../../../api/dist/defs/monaco/database-defs.d.ts?raw'

registerDslType('action', {
  prefix: 'action:',
  schema: actionSchema,
  globals: {
    services: 'typeof _dsl.services',
    z: 'typeof _dsl.z',
    flowId: 'string',
  },
})

registerDslType('prompt', {
  prefix: 'prompt:',
  schema: promptSchema,
  globals: {
    usePrompt: 'typeof _dsl.usePrompt',
  },
})

registerDslType('database', {
  prefix: 'database:',
  schema: databaseSchema,
  globals: {
    EARS: 'typeof _dsl.EARS',
    qx: 'typeof _dsl.qx',
    tx: 'typeof _dsl.tx',
    bp: 'typeof _dsl.bp',
    spawn: 'typeof _dsl.spawn',
    getSchemaStats: 'typeof _dsl.getSchemaStats',
    isEntity: 'typeof _dsl.isEntity',
  },
})
