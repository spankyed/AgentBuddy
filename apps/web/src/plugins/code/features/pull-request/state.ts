import { setup, assign } from 'xstate';
import { trpc } from '@/core/trpc';
import type { GitStatusFile, GitDiff } from '../../state';
import { updateParentState, getParentContext } from '../../utils/parent-communication';

const sendToBackend = (type: string, data: any) => {
  trpc.bus.send.mutate({
    systemId: 'code' as any,
    type: type as any,
    ...data
  } as any)
}

export interface Context {
  prFiles: GitStatusFile[]
  prBaseBranch: string
  prError: string | null
  isPrLoading: boolean
  selectedPrFile: GitStatusFile | null
  prDiff: GitDiff | null
}

export type Event = 
  | { type: 'pr.REFRESH_STATUS' }
  | { type: 'pr.SELECT_FILE'; file: GitStatusFile }
  | { type: 'pr.VIEW_DIFF'; path: string }
  | { type: 'pr.BASE_BRANCH_RECEIVED'; branch: string }
  | { type: 'pr.BRANCH_DIFF_RECEIVED'; files: GitStatusFile[]; baseBranch: string }
  | { type: 'pr.FILE_DIFF_RECEIVED'; diff: GitDiff }
  | { type: 'pr.ERROR'; message: string }
  | { type: 'pr.BASE_BRANCH'; data: { branch: string } }
  | { type: 'pr.BRANCH_DIFF'; data: { files: GitStatusFile[]; baseBranch: string } }
  | { type: 'pr.BRANCH_FILE_DIFF'; data: GitDiff };

export const pullRequestState = setup({
  types: {
    context: {} as Context,
    events: {} as Event
  },
  actions: {
    refreshPrStatus: () => {
      sendToBackend('GET_BASE_BRANCH', {})
      sendToBackend('GET_BRANCH_DIFF', {})
    },
    
    assignBaseBranch: assign({
      prBaseBranch: ({ event }) => {
        const ev = event as { type: 'pr.BASE_BRANCH_RECEIVED'; branch: string }
        return ev.branch
      },
      isPrLoading: false,
      prError: null
    }),
    
    assignBranchDiff: assign({
      prFiles: ({ event }) => {
        const ev = event as { type: 'pr.BRANCH_DIFF_RECEIVED'; files: GitStatusFile[]; baseBranch: string }
        return ev.files
      },
      prBaseBranch: ({ event }) => {
        const ev = event as { type: 'pr.BRANCH_DIFF_RECEIVED'; files: GitStatusFile[]; baseBranch: string }
        return ev.baseBranch
      },
      isPrLoading: false
    }),
    
    selectPrFile: assign({
      selectedPrFile: ({ event }) => {
        const ev = event as { type: 'pr.SELECT_FILE'; file: GitStatusFile }
        return ev.file
      }
    }),
    
    viewPrDiff: ({ event, context }) => {
      const ev = event as { type: 'pr.VIEW_DIFF'; path: string }
      sendToBackend('GET_BRANCH_FILE_DIFF', { 
        path: ev.path, 
        baseBranch: context.prBaseBranch 
      })
    },
    
    assignPrDiff: assign({
      prDiff: ({ event }) => {
        const ev = event as { type: 'pr.FILE_DIFF_RECEIVED'; diff: GitDiff }
        return ev.diff
      }
    }),
    
    assignPrError: assign({
      prError: ({ event }) => {
        const ev = event as { type: 'pr.ERROR'; message: string }
        return ev.message
      },
      isPrLoading: false
    }),
    
    setPrLoading: assign({ isPrLoading: true })
  }
}).createMachine({
  id: 'pullRequest',
  initial: 'idle',
  context: {
    prFiles: [],
    prBaseBranch: '',
    prError: null,
    isPrLoading: false,
    selectedPrFile: null,
    prDiff: null
  },
  states: {
    idle: {
      on: {
        'pr.REFRESH_STATUS': {
          actions: ['setPrLoading', 'refreshPrStatus']
        },
        'pr.BASE_BRANCH_RECEIVED': {
          actions: 'assignBaseBranch'
        },
        'pr.BRANCH_DIFF_RECEIVED': {
          actions: 'assignBranchDiff'
        },
        'pr.SELECT_FILE': {
          actions: 'selectPrFile'
        },
        'pr.VIEW_DIFF': {
          actions: 'viewPrDiff'
        },
        'pr.FILE_DIFF_RECEIVED': {
          actions: ['assignPrDiff', ({ self, context, event }) => {
            const ev = event as { type: 'pr.FILE_DIFF_RECEIVED'; diff: GitDiff }
            if (context.selectedPrFile) {
              const parentContext = getParentContext(self)
              const diffTabId = `pr-diff:${context.selectedPrFile.path}`;
              
              // Build new openFiles array
              const openFiles = parentContext?.openFiles || []
              const existingTab = openFiles.find((f: any) => f.path === diffTabId)
              
              let newOpenFiles
              if (existingTab) {
                // Update existing tab
                newOpenFiles = openFiles.map((f: any) => 
                  f.path === diffTabId 
                    ? { ...f, gitDiff: ev.diff, gitFile: context.selectedPrFile }
                    : f
                )
              } else {
                // Add new diff tab
                const diffTab = {
                  path: diffTabId,
                  content: '',
                  modified: false,
                  isDiff: true,
                  gitDiff: ev.diff,
                  gitFile: context.selectedPrFile
                }
                newOpenFiles = [...openFiles, diffTab]
              }
              
              // Send updated state to parent
              updateParentState(self, {
                openFiles: newOpenFiles,
                activeFilePath: diffTabId
              });
            }
          }]
        },
        'pr.ERROR': {
          actions: 'assignPrError'
        },
        'pr.BASE_BRANCH': {
          actions: assign({
            prBaseBranch: ({ event }) => {
              const ev = event as { type: 'pr.BASE_BRANCH'; data: { branch: string } }
              return ev.data.branch
            },
            isPrLoading: false,
            prError: null
          })
        },
        'pr.BRANCH_DIFF': {
          actions: assign({
            prFiles: ({ event }) => {
              const ev = event as { type: 'pr.BRANCH_DIFF'; data: { files: GitStatusFile[]; baseBranch: string } }
              return ev.data.files
            },
            prBaseBranch: ({ event }) => {
              const ev = event as { type: 'pr.BRANCH_DIFF'; data: { files: GitStatusFile[]; baseBranch: string } }
              return ev.data.baseBranch
            },
            isPrLoading: false
          })
        },
        'pr.BRANCH_FILE_DIFF': {
          actions: [assign({
            prDiff: ({ event }) => {
              const ev = event as { type: 'pr.BRANCH_FILE_DIFF'; data: GitDiff }
              return ev.data
            }
          }), ({ self, context, event }) => {
            const ev = event as { type: 'pr.BRANCH_FILE_DIFF'; data: GitDiff }
            if (context.selectedPrFile) {
              const parentContext = getParentContext(self)
              const diffTabId = `pr-diff:${context.selectedPrFile.path}`;
              
              // Build new openFiles array
              const openFiles = parentContext?.openFiles || []
              const existingTab = openFiles.find((f: any) => f.path === diffTabId)
              
              let newOpenFiles
              if (existingTab) {
                // Update existing tab
                newOpenFiles = openFiles.map((f: any) => 
                  f.path === diffTabId 
                    ? { ...f, gitDiff: ev.data, gitFile: context.selectedPrFile }
                    : f
                )
              } else {
                // Add new diff tab
                const diffTab = {
                  path: diffTabId,
                  content: '',
                  modified: false,
                  isDiff: true,
                  gitDiff: ev.data,
                  gitFile: context.selectedPrFile
                }
                newOpenFiles = [...openFiles, diffTab]
              }
              
              // Send updated state to parent
              updateParentState(self, {
                openFiles: newOpenFiles,
                activeFilePath: diffTabId
              });
            }
          }]
        }
      }
    }
  }
});