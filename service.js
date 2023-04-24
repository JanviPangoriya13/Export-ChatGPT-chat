const generateOffsets = (startOffset, total, interval = 20) => {
  const start = startOffset + interval;
  const offsets = [];

  for (let i = start; i <= total; i += interval) {
    offsets.push(i);
  }
  return offsets;
};

const sleep = (ms = 1000) => new Promise((resolve) => setTimeout(resolve, ms));

const parseConversation = (rawConversation) => {
  const { title, create_time, mapping } = rawConversation;
  const messages = [];
  Object.keys(mapping).forEach((keys) => {
    const msg = mapping[keys].message;
    if (msg) {
      messages.push({
        role: msg.author.role,
        content: msg.content.parts,
        create_time: msg.create_time,
      });
    }
  });
  return {
    messages,
    create_time,
    title,
  };
};

const getRequestCount = (total, startOffset, stopOffset) =>
  stopOffset === -1 ? total : stopOffset - startOffset;

const storeToken = async (token) =>
  new Promise((resolve, reject) => {
    chrome.storage.sync.set({ access_token: token }, () =>
      chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve()
    );
  });

const getToken = async () =>
  new Promise((resolve, reject) => {
    chrome.storage.sync.get("access_token", (items) =>
      chrome.runtime.lastError
        ? reject(chrome.runtime.lastError)
        : resolve(items.access_token)
    );
  });

const loadToken = async () => {
  const storedToken = await getToken();
  if (storedToken) return storedToken;
  const res = await fetch("https://chat.openai.com/api/auth/session");
  if (res.ok) {
    const accessToken = (await res.json()).accessToken;
    await storeToken(accessToken);
    return accessToken;
  } else {
    return Promise.reject("Unable to fetch token");
  }
};

const getFirstConversationId = async () => {
  const token = await loadToken();
  const res = await fetch(
    "https://chat.openai.com/backend-api/conversations?offset=0&limit=1",
    {
      headers: {
        authorization: `Bearer ${token}`,
      },
    }
  );
  if (!res.ok) {
    if (res.status === 401) {
      await chrome.storage.sync.remove("access_token");
    }
    throw new Error("Unable to fetch conversation, Please try again");
  }
  return (await res.json()).items[0].id;
};

const getConversationIds = async (token, offset = 0) => {
  const res = await fetch(
    `https://chat.openai.com/backend-api/conversations?offset=${offset}&limit=20`,
    {
      headers: {
        authorization: `Bearer ${token}`,
      },
    }
  );
  if (!res.ok) {
    throw new Error("Unable to fetch conversations");
  }
  const json = await res.json();
  return {
    items: json.items.map((item) => ({ ...item, offset })),
    total: json.total,
  };
};

const fetchConversation = async (token, id, maxAttempts = 3, attempt = 1) => {
  const res = await fetch(
    `https://chat.openai.com/backend-api/conversation/${id}`,
    {
      headers: {
        authorization: `Bearer ${token}`,
      },
    }
  );

  if (!res.ok) {
    if (res.status === 429 && attempt < maxAttempts) {
      await sleep(30000);
      return fetchConversation(token, id, maxAttempts, attempt + 1);
    } else {
      throw new Error("Unable to fetch conversation");
    }
  }
  return res.json();
};

const getAllConversations = async (startOffset, stopOffset) => {
  const token = await loadToken();
  const { total, items: allItems } = await getConversationIds(
    token,
    startOffset
  );
  const offsets = generateOffsets(startOffset, total);
  let allConversations = [];
  for (const offset of offsets) {
    if (offset === stopOffset) break;
    await sleep();
    const { items } = await getConversationIds(token, offset);
    allItems.push.apply(allItems, items);
  }
  for (const item of allItems) {
    await sleep();
    const rawConversation = await fetchConversation(token, item.id);
    allConversations.push(parseConversation(rawConversation));
  }
  return allConversations;
};

const main = async (startOffset, stopOffset) =>
  await getAllConversations(startOffset, stopOffset);

const saveAs = (
  contentString = "",
  fileType = "text/plain",
  filename = "file.txt"
) => {
  let base64Data, dataUrl;
  base64Data = btoa(unescape(encodeURIComponent(contentString)));
  dataUrl = `data:${fileType};base64,${base64Data}`;
  chrome.downloads.download(
    {
      url: dataUrl,
      filename: filename,
    },
    () => {
      chrome.runtime.lastError &&
        console.error(chrome.runtime.lastError.message);
    }
  );
};
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.message) {
    case "getColorScheme":
      chrome.storage.local.set({ colorScheme: request.colorScheme });
      break;
    case "backUpAllAsJSON":
      main(request.startOffset, request.stopOffset).then((allConversations) => {
        downloadJson(allConversations);
        sendResponse({ message: "backUpAllAsJSON done" });
      });
      break;
    case "backUpSingleChat":
      handleSingleUrlId(request.tabs).then((conversation) => {
        downloadJson(conversation);
        sendResponse({ message: "backUpSingleChat done", conversation });
      });
      break;
  }
  return true;
});

const handleSingleUrlId = async (tabs) => {
  const parsedUrl = new URL(tabs[0].url);
  const pathSegments = parsedUrl.pathname.split("/");
  const conversationId = pathSegments[pathSegments.length - 1];
  const regex = /[a-z0-9]+-[a-z0-9]+-[a-z0-9]+/g;
  const token = await loadToken();
  let id = conversationId;
  if (!conversationId.match(regex)) {
    const res = await getConversationIds(token);
    id = res.items[0].id;
  }
  const rawConversation = await fetchConversation(token, id);
  const conversation = parseConversation(rawConversation);
  return [conversation];
};

const downloadJson = (data) => {
  if (!data) {
    console.error("No data");
    return;
  }
  const dateStr = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonString = JSON.stringify(data, null, 2);
  saveAs(jsonString, "application/json", `chat-${dateStr}.json`);
};
