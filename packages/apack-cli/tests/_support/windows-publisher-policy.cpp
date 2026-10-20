#include <windows.h>
#include <winsxs.h>
#include <stdio.h>

struct ComApartment {
  HRESULT status = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
  ~ComApartment() { if (SUCCEEDED(status)) CoUninitialize(); }
};
int wmain(int argc, wchar_t** argv) {
  if (argc != 3) return 2;
  ComApartment apartment;
  if (FAILED(apartment.status)) return 7;
  HMODULE module = LoadLibraryW(L"sxs.dll");
  if (!module) return 3;
  typedef HRESULT (WINAPI *CreateCache)(IAssemblyCache**, DWORD);
  CreateCache create = reinterpret_cast<CreateCache>(GetProcAddress(module, "CreateAssemblyCache"));
  if (!create) return 4;
  IAssemblyCache* cache = nullptr;
  HRESULT result = create(&cache, 0);
  if (FAILED(result)) { printf("create: %08lx\n", result); return 5; }
  ULONG disposition = 0;
  if (wcscmp(argv[1], L"install") == 0) result = cache->InstallAssembly(0, argv[2], nullptr);
  else if (wcscmp(argv[1], L"uninstall") == 0) result = cache->UninstallAssembly(0, argv[2], nullptr, &disposition);
  else if (wcscmp(argv[1], L"query") == 0) {
    ASSEMBLY_INFO info = {}; info.cbAssemblyInfo = sizeof(info);
    result = cache->QueryAssemblyInfo(0, argv[2], &info);
  } else { cache->Release(); FreeLibrary(module); return 6; }
  printf("%ls: %08lx disposition %lu\n", argv[1], result, disposition);
  cache->Release(); FreeLibrary(module);
  return FAILED(result) ? 1 : 0;
}
