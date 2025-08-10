export function generateUniqueFolderName(existingNames: string[]): string {
  const baseName = 'New Folder'
  let counter = 1
  let finalName = baseName
  
  while (existingNames.includes(finalName)) {
    finalName = `${baseName} ${counter}`
    counter++
  }
  
  return finalName
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  
  if (date.toDateString() === today.toDateString()) {
    return 'Today, ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } else if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday, ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } else {
    return date.toLocaleDateString() + ', ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
}