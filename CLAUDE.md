# CLAUDE.md - AgentBuddy development

This file provides guidance to Claude Code when developing in the AgentBuddy repository.

## Overview

The frontend (/packages/renderer) uses a plugin-based architecture where each plugin is an XState actor that manages its own state and UI. Plugins communicate with backend systems via WebSocket (trpc) events and display content in designated UI areas.

The backend (/packages/api) uses an event-driven, actor-based system architecture built on XState state machines. Each system is an independent actor that communicates through typed events via a central bus.

## Debugging

- Run `npm run typecheck:fe` to type check the FE
- Run `npm run typecheck:be` to run type check for the backend
- Run `npm run test-build` to ensure build the backend & frontend compile