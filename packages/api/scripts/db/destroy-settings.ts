#!/usr/bin/env tsx
import { qx } from '@/core/ears/helpers/query';
import { tx } from '@/core/ears/helpers/transaction';

qx('Settings').ids().forEach(id => tx(id).destroy());