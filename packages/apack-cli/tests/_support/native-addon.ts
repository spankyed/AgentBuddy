export function nativeAddonSource(marker: string): string {
  return `#include <node_api.h>
#include <stdio.h>
#ifdef _WIN32
#include <windows.h>
__declspec(dllimport) int native_value(void);
static napi_value library_path(napi_env env, napi_callback_info info) {
  HMODULE module;
  WCHAR file[32768];
  if (!GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
      (LPCWSTR)&native_value, &module)) {
    napi_throw_error(env, NULL, "Cannot locate native value library"); return NULL;
  }
  DWORD length = GetModuleFileNameW(module, file, sizeof(file) / sizeof(file[0]));
  if (!length || length >= sizeof(file) / sizeof(file[0])) {
    napi_throw_error(env, NULL, "Cannot read complete native value library path"); return NULL;
  }
  napi_value value; napi_create_string_utf16(env, (const char16_t *)file, length, &value); return value;
}
#else
extern int native_value(void);
#endif
static napi_value read_value(napi_env env, napi_callback_info info) {
  napi_value value; napi_create_int32(env, native_value(), &value); return value;
}
NAPI_MODULE_INIT() {
  FILE *marker = fopen(${JSON.stringify(marker)}, "w"); if (marker) fclose(marker);
  napi_value read; napi_create_function(env, "read", NAPI_AUTO_LENGTH, read_value, 0, &read);
  napi_set_named_property(env, exports, "read", read);
#ifdef _WIN32
  napi_value path; napi_create_function(env, "libraryPath", NAPI_AUTO_LENGTH, library_path, 0, &path);
  napi_set_named_property(env, exports, "libraryPath", path);
#endif
  return exports;
}`;
}
