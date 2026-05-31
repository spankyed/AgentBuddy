import { FileCode, FileJson, FileText, Image, File, Video } from 'lucide-vue-next'

const codeExtensions = ['js', 'ts', 'jsx', 'tsx', 'vue', 'py', 'java', 'c', 'cpp', 'go', 'rs', 'php', 'rb', 'swift']
const textExtensions = ['txt', 'md', 'log', 'csv', 'xml', 'yaml', 'yml']
export const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'ico', 'webp']
export const videoExtensions = ['mp4', 'webm', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'm4v']

export function getFileIcon(extension?: string) {
  if (!extension) return File
  if (codeExtensions.includes(extension)) return FileCode
  if (extension === 'json') return FileJson
  if (textExtensions.includes(extension)) return FileText
  if (imageExtensions.includes(extension)) return Image
  if (videoExtensions.includes(extension)) return Video
  return File
}
