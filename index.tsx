import OpenAI from "openai";
import dotenv from "dotenv";
dotenv.config();

// --- DOM Elements ---
const chatForm = document.getElementById('chat-form') as HTMLFormElement;
const promptInput = document.getElementById('prompt-input') as HTMLInputElement;
const sendBtn = document.getElementById('send-btn') as HTMLButtonElement;
const messageList = document.getElementById('message-list') as HTMLDivElement;
const chatContainer = document.getElementById('chat-container') as HTMLDivElement;
const topColorInput = document.getElementById('top-color-input') as HTMLInputElement;
const bottomColorInput = document.getElementById('bottom-color-input') as HTMLInputElement;
const imageCountInput = document.getElementById('image-count-input') as HTMLInputElement;
const userStatusElement = document.getElementById('user-status') as HTMLParagraphElement;

// View switching
const chatViewBtn = document.getElementById('chat-view-btn') as HTMLButtonElement;
const galleryViewBtn = document.getElementById('gallery-view-btn') as HTMLButtonElement;
const worldViewBtn = document.getElementById('world-view-btn') as HTMLButtonElement;
const views = document.querySelectorAll('.view');

// Gallery
const galleryView = document.getElementById('gallery-view') as HTMLDivElement;
const galleryGrid = document.getElementById('gallery-grid') as HTMLDivElement;
const galleryPlaceholder = document.getElementById('gallery-placeholder') as HTMLDivElement;

// World Favorites
const worldFavoritesView = document.getElementById('world-favorites-view') as HTMLDivElement;
const worldFavoritesGrid = document.getElementById('world-favorites-grid') as HTMLDivElement;

// Lightbox
const lightboxModal = document.getElementById('lightbox-modal') as HTMLDivElement;
const lightboxImage = document.getElementById('lightbox-image') as HTMLImageElement;
const lightboxClose = document.getElementById('lightbox-close') as HTMLSpanElement;

// Share Modal
const shareModal = document.getElementById('share-modal') as HTMLDivElement;
const shareUsernameInput = document.getElementById('share-username-input') as HTMLInputElement;
const shareConsentCheckbox = document.getElementById('share-consent-checkbox') as HTMLInputElement;
const shareConfirmBtn = document.getElementById('share-confirm-btn') as HTMLButtonElement;
const shareCancelBtn = document.getElementById('share-cancel-btn') as HTMLButtonElement;


// --- AI Setup ---
const openai = new OpenAI({
    apiKey: process.env.VITE_OPENAI_API_KEY,
    dangerouslyAllowBrowser: true, // if running in browser
});

const chatResponse = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [
        { role: "user", content: "Hello" },
    ],
});

// --- App State ---
interface Image { id: number; url: string; prompt: string; }
interface SharedImage extends Image { username: string; votes: number; }

let isLoading = false;
let savedImages: Image[] = [];
let sharedImages: SharedImage[] = [];
let imageCounter = 0;
let upvotedImageIds = new Set<number>();
let imageToShare: { id: number; url: string; prompt: string } | null = null;



// --- Functions ---

/** Scrolls the chat container to the bottom. */
function scrollChatDown() {
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

/** Sets the UI state to loading or idle. */
function setLoading(loading: boolean) {
    isLoading = loading;
    sendBtn.disabled = loading;
    promptInput.disabled = loading;
    topColorInput.disabled = loading;
    bottomColorInput.disabled = loading;
    imageCountInput.disabled = loading;
}

/** Appends a message from the user to the chat list. */
function appendUserMessage(text: string) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message user-message';
    messageDiv.textContent = text;
    messageList.appendChild(messageDiv);
}

/** Appends a placeholder for the AI's response, usually with a loader. */
function appendAiMessagePlaceholder(): HTMLElement {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message ai-message';
    const loader = document.createElement('div');
    loader.className = 'loader';
    messageDiv.appendChild(loader);
    messageList.appendChild(messageDiv);
    return messageDiv;
}

/** Displays an error message within an AI message bubble. */
function displayErrorInBubble(element: HTMLElement, message: string) {
    element.innerHTML = ''; // Clear loader
    element.style.color = 'var(--error-color)';
    element.textContent = message;
}

/** Adds the initial welcome message from the AI. */
function addInitialMessage() {
    const aiMessage = document.createElement('div');
    aiMessage.className = 'message ai-message';
    const messageText = document.createElement('p');
    messageText.textContent = "Describe a costume idea to get started. You can then refine it, like 'make #2 more spooky'. Use the color pickers to guide the design.";
    aiMessage.appendChild(messageText);
    messageList.appendChild(aiMessage);
}

/** Updates the welcome message in the header. */
function updateUserStatus() {
    const username = localStorage.getItem('costumeDesignerUsername');
    if (userStatusElement) {
        if (username) {
            userStatusElement.textContent = `Welcome, ${username}! Let's design a costume.`;
        } else {
            userStatusElement.textContent = 'Welcome, Guest! Chat with the AI to create your costume.';
        }
    }
}

/** Downloads an image. */
function downloadImage(url: string, filename: string) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

/** Saves or unsaves an image to the personal gallery. */
function toggleSaveImage(id: number, url: string, prompt: string, button: HTMLButtonElement) {
    const existingIndex = savedImages.findIndex(img => img.id === id);
    if (existingIndex > -1) {
        savedImages.splice(existingIndex, 1);
        button.classList.remove('saved');
    } else {
        savedImages.push({ id, url, prompt });
        button.classList.add('saved');
    }
    localStorage.setItem('savedCostumeImages', JSON.stringify(savedImages));
    if (document.getElementById('gallery-view')?.style.display === 'block') {
        renderGallery();
    }
}

/** Handles opening the share modal */
function openShareModal(id: number, url: string, prompt: string) {
    if (sharedImages.some(img => img.id === id)) return; // Already shared
    imageToShare = { id, url, prompt };
    shareModal.classList.add('visible');
    shareUsernameInput.value = localStorage.getItem('costumeDesignerUsername') || '';
    shareConsentCheckbox.checked = false;
    shareConfirmBtn.disabled = true;
}

/** Handles closing the share modal */
function closeShareModal() {
    shareModal.classList.remove('visible');
    imageToShare = null;
}

/** Confirms and processes the image share */
function confirmShare() {
    if (!imageToShare || !shareConsentCheckbox.checked) return;
    const username = shareUsernameInput.value.trim() || 'Anonymous';

    sharedImages.push({ ...imageToShare, username, votes: 0 });
    localStorage.setItem('sharedCostumeImages', JSON.stringify(sharedImages));
    localStorage.setItem('costumeDesignerUsername', username);
    updateUserStatus();

    // Update the share button state
    const shareButton = document.querySelector(`.image-actions button[data-action='share'][data-id='${imageToShare.id}']`);
    if (shareButton) {
        shareButton.classList.add('shared');
        (shareButton as HTMLButtonElement).disabled = true;
    }

    closeShareModal();
    renderWorldFavorites();
}

/** Loads all state from local storage. */
function loadState() {
    savedImages = JSON.parse(localStorage.getItem('savedCostumeImages') || '[]');
    sharedImages = JSON.parse(localStorage.getItem('sharedCostumeImages') || '[]');
    imageCounter = parseInt(localStorage.getItem('costumeImageCounter') || '0', 10);
    upvotedImageIds = new Set(JSON.parse(localStorage.getItem('upvotedCostumeIds') || '[]'));
}

/** Renders the personal gallery view. */
function renderGallery() {
    galleryGrid.innerHTML = '';
    if (savedImages.length === 0) {
        galleryPlaceholder.style.display = 'block';
        return;
    }
    galleryPlaceholder.style.display = 'none';
    savedImages.sort((a, b) => a.id - b.id).forEach(imgData => {
        const imageElement = createGalleryImageElement(imgData);
        galleryGrid.appendChild(imageElement);
    });
}

/** Renders the World Favorites view. */
function renderWorldFavorites() {
    worldFavoritesGrid.innerHTML = '';
    const allFavorites = [...sharedImages];
    if (allFavorites.length === 0) {
        return;
    }

    allFavorites.sort((a, b) => b.votes - a.votes);

    allFavorites.forEach(imgData => {
        const card = createWorldFavoriteCard(imgData);
        worldFavoritesGrid.appendChild(card);
    });
}

/** Switches the main view. */
function switchView(targetView: 'chat' | 'gallery' | 'world') {
    views.forEach(view => (view as HTMLElement).style.display = 'none');
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));

    document.getElementById(`${targetView}-view`)!.style.display = 'block';
    document.getElementById(`${targetView}-view-btn`)!.classList.add('active');

    if (targetView === 'chat') {
        document.getElementById('chat-view')!.style.display = 'flex';
    }
    if (targetView === 'gallery') renderGallery();
    if (targetView === 'world') renderWorldFavorites();
}

/** Opens the lightbox with a specific image. */
function openLightbox(url: string, alt: string) {
    lightboxImage.src = url;
    lightboxImage.alt = alt;
    lightboxModal.classList.add('visible');
}

/** Closes the lightbox. */
function closeLightbox() {
    lightboxModal.classList.remove('visible');
}


/** Creates an image element for the chat grid. */
function createChatImageElement(id: number, url: string, prompt: string): HTMLDivElement {
    const container = document.createElement('div');
    container.className = 'image-container';

    const imgElement = document.createElement('img');
    imgElement.src = url;
    imgElement.alt = `AI-generated image #${id}: ${prompt}`;
    imgElement.addEventListener('click', () => openLightbox(url, imgElement.alt));

    const actions = document.createElement('div');
    actions.className = 'image-actions';

    // Save button
    const saveButton = document.createElement('button');
    saveButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z"/></svg>`;
    saveButton.setAttribute('aria-label', 'Save image');
    if (savedImages.some(img => img.id === id)) saveButton.classList.add('saved');
    saveButton.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleSaveImage(id, url, prompt, saveButton);
    });

    // Share button
    const shareButton = document.createElement('button');
    shareButton.dataset.id = String(id);
    shareButton.dataset.action = 'share';
    shareButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3s3-1.34 3-3-1.34-3-3-3z"/></svg>`;
    shareButton.setAttribute('aria-label', 'Share to World Favorites');
    if (sharedImages.some(img => img.id === id)) {
        shareButton.classList.add('shared');
        shareButton.disabled = true;
    }
    shareButton.addEventListener('click', (e) => {
        e.stopPropagation();
        openShareModal(id, url, prompt);
    });

    // Download button
    const downloadButton = document.createElement('button');
    downloadButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>`;
    downloadButton.setAttribute('aria-label', 'Download image');
    downloadButton.addEventListener('click', (e) => {
        e.stopPropagation();
        downloadImage(url, `costume-idea-${id}.jpeg`);
    });

    actions.appendChild(saveButton);
    actions.appendChild(shareButton);
    actions.appendChild(downloadButton);

    const number = document.createElement('span');
    number.className = 'image-number';
    number.textContent = String(id);

    container.appendChild(imgElement);
    container.appendChild(actions);
    container.appendChild(number);

    return container;
}

/** Creates an image element for the personal gallery grid. */
function createGalleryImageElement(imgData: Image): HTMLDivElement {
    const { id, url, prompt } = imgData;
    const container = document.createElement('div');
    container.className = 'image-container';

    const imgElement = document.createElement('img');
    imgElement.src = url;
    imgElement.alt = `AI-generated image #${id}: ${prompt}`;
    imgElement.addEventListener('click', () => openLightbox(url, imgElement.alt));

    const actions = document.createElement('div');
    actions.className = 'image-actions';

    const removeButton = document.createElement('button');
    removeButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px"><path d="M16 9v10H8V9h8m-1.5-6h-5l-1 1H5v2h14V4h-3.5l-1-1zM18 7H6v12c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7z"/></svg>`;
    removeButton.setAttribute('aria-label', 'Remove from gallery');
    removeButton.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleSaveImage(id, url, prompt, removeButton); // This effectively removes it
    });

    actions.appendChild(removeButton);
    container.appendChild(imgElement);
    container.appendChild(actions);

    return container;
}

/** Creates a card for the World Favorites grid. */
function createWorldFavoriteCard(imgData: SharedImage): HTMLDivElement {
    const card = document.createElement('div');
    card.className = 'world-image-card';

    const imageContainer = createGalleryImageElement(imgData); // Re-use gallery element for image + lightbox

    const info = document.createElement('div');
    info.className = 'card-info';

    const username = document.createElement('span');
    username.className = 'username';
    username.textContent = `@${imgData.username}`;

    const upvoteAction = document.createElement('div');
    upvoteAction.className = 'upvote-action';

    const voteCount = document.createElement('span');
    voteCount.className = 'upvote-count';
    voteCount.textContent = String(imgData.votes);

    const upvoteButton = document.createElement('button');
    upvoteButton.className = 'upvote-btn';
    upvoteButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px"><path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"/></svg>`;
    upvoteButton.setAttribute('aria-label', 'Upvote');
    if (upvotedImageIds.has(imgData.id)) {
        upvoteButton.classList.add('voted');
    }

    upvoteButton.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!upvotedImageIds.has(imgData.id)) {
            imgData.votes++;
            voteCount.textContent = String(imgData.votes);
            upvotedImageIds.add(imgData.id);
            localStorage.setItem('upvotedCostumeIds', JSON.stringify(Array.from(upvotedImageIds)));
            upvoteButton.classList.add('voted');
            upvoteButton.disabled = true;
        }
    });

    upvoteAction.appendChild(upvoteButton);
    upvoteAction.appendChild(voteCount);
    info.appendChild(username);
    info.appendChild(upvoteAction);

    card.appendChild(imageContainer);
    card.appendChild(info);

    return card;
}

/** Handles the chat form submission using OpenAI. */
async function handleChatSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (isLoading) return;

    const promptText = promptInput.value.trim();
    if (!promptText) return;

    const numImages = Math.max(1, Math.min(4, parseInt(imageCountInput.value, 10) || 4));

    setLoading(true);
    appendUserMessage(promptText);
    promptInput.value = '';
    scrollChatDown();

    const aiMessageBubble = appendAiMessagePlaceholder();
    scrollChatDown();

    try {
        const topColor = topColorInput.value;
        const bottomColor = bottomColorInput.value;

        const chatPrompt = `My latest instruction is: "${promptText}". Refine the costume idea incorporating a top color of ${topColor} and a bottom color of ${bottomColor}.`;

        // 🧠 Use OpenAI's chat completion to refine the costume prompt
        const chatResponse = await openai.chat.completions.create({
            model: "gpt-4",
            messages: [{ role: "user", content: chatPrompt }],
        });

        const refinedPrompt = chatResponse.choices[0]?.message?.content?.trim() || chatPrompt;

        // 🎨 Use OpenAI's DALL·E model to generate images
        const imageResponse = await openai.images.generate({
            model: "dall-e-2", // You can also use "dall-e-2"
            prompt: refinedPrompt,
            n: numImages,
            size: "1024x1024", // Closest to 3:4 available (OpenAI supports limited sizes)
            response_format: "url" // or "b64_json" if you want to embed directly
        });

        aiMessageBubble.innerHTML = ''; // Clear loader

        if (imageResponse.data && imageResponse.data.length > 0) {
            const grid = document.createElement('div');
            grid.className = 'image-grid';

            imageResponse.data.forEach((imgData, index) => {
                const id = imageCounter + index + 1;
                const url = imgData.url ?? ""; // or `data:image/jpeg;base64,${imgData.b64_json}` if using base64
                const imageElement = createChatImageElement(id, url, refinedPrompt);
                grid.appendChild(imageElement);
            });

            imageCounter += imageResponse.data.length;
            localStorage.setItem('costumeImageCounter', String(imageCounter));

            aiMessageBubble.appendChild(grid);
        } else {
            displayErrorInBubble(aiMessageBubble, "No images were generated. Try a different idea.");
        }

    } catch (error) {
        console.error('Error in chat/image generation:', error);
        displayErrorInBubble(aiMessageBubble, 'An unexpected error occurred. Please check the console and try again.');
    } finally {
        setLoading(false);
        promptInput.focus();
        scrollChatDown();
    }
}


// --- Initial Setup & Event Listeners ---
loadState();
updateUserStatus();
addInitialMessage();
switchView('chat'); // Start on chat view

chatForm.addEventListener('submit', handleChatSubmit);

// View navigation
chatViewBtn.addEventListener('click', () => switchView('chat'));
galleryViewBtn.addEventListener('click', () => switchView('gallery'));
worldViewBtn.addEventListener('click', () => switchView('world'));

// Lightbox
lightboxClose.addEventListener('click', closeLightbox);
lightboxModal.addEventListener('click', (e) => {
    if (e.target === lightboxModal) closeLightbox();
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (shareModal.classList.contains('visible')) closeShareModal();
        else closeLightbox();
    }
});

// Share Modal
shareCancelBtn.addEventListener('click', closeShareModal);
shareConfirmBtn.addEventListener('click', confirmShare);
shareConsentCheckbox.addEventListener('change', () => {
    shareConfirmBtn.disabled = !shareConsentCheckbox.checked;
});
shareModal.addEventListener('click', (e) => {
    if (e.target === shareModal) closeShareModal();
});