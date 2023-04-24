const colorScheme = document.documentElement.classList.contains("dark")
  ? "dark"
  : "light";
chrome.runtime.sendMessage({
  message: "getColorScheme",
  colorScheme,
});
