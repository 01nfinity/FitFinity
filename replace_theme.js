const fs = require('fs');
const path = require('path');

const files = [
  'app/(tabs)/calendar.tsx',
  'app/(tabs)/exercises.tsx',
  'app/(tabs)/index.tsx',
  'app/(tabs)/log.tsx',
  'app/(tabs)/_layout.tsx'
];

files.forEach(file => {
  const filePath = path.join(__dirname, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  if (file === 'app/(tabs)/_layout.tsx') {
    content = content.replace("import { useColorScheme } from 'react-native';", "import { useTheme } from '../context/ThemeContext';");
    content = content.replace("const colorScheme = useColorScheme();", "const { isDark } = useTheme();");
    content = content.replace("const isDark = colorScheme === 'dark';", "");
  } else {
    content = content.replace("useColorScheme", "useTheme");
    content = content.replace("import { useTheme } from 'react-native';", "import { useTheme } from '../context/ThemeContext';");
    content = content.replace("const isDark = useTheme() === 'dark';", "const { isDark } = useTheme();");
    // Handle the import correctly since useColorScheme was imported from react-native
    content = content.replace("useColorScheme } from 'react-native'", "} from 'react-native'");
    content = content.replace("useColorScheme} from 'react-native'", "} from 'react-native'");
    content = content.replace("import { useTheme } from 'react-native'", "");
    if (!content.includes("context/ThemeContext")) {
      content = content.replace("import { Colors }", "import { useTheme } from '../context/ThemeContext';\nimport { Colors }");
    }
  }
  
  fs.writeFileSync(filePath, content);
});
console.log('Replaced successfully');
