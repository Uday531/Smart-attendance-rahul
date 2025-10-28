// This service is now mocked to remove the dependency on a live backend server.
// It simulates the API calls for face registration and verification, using localStorage
// to persist registered users across sessions.

/**
 * Retrieves the list of registered user IDs from localStorage.
 * @returns An array of UIDs.
 */
const getRegisteredUids = (): string[] => {
    const uids = localStorage.getItem('face_recognition_uids');
    return uids ? JSON.parse(uids) : [];
};

/**
 * Saves the list of registered user IDs to localStorage.
 * @param uids An array of UIDs.
 */
const saveRegisteredUids = (uids: string[]) => {
    localStorage.setItem('face_recognition_uids', JSON.stringify(uids));
};


/**
 * Converts a base64 data URL to a Blob object.
 * @param dataUrl The base64 data URL string.
 * @returns A Blob object representing the image.
 */
export const dataUrlToBlob = (dataUrl: string): Blob => {
    const arr = dataUrl.split(',');
    if (arr.length < 2) throw new Error("Invalid Data URL");
    const mimeMatch = arr[0].match(/:(.*?);/);
    if (!mimeMatch) throw new Error("Could not parse MIME type from Data URL");
    const mime = mimeMatch[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
};

/**
 * Mocks the registration of a user's face.
 * @param uid The user's unique Firebase ID.
 * @param imageBlob The user's profile picture as a Blob.
 */
export const registerFace = async (uid: string, imageBlob: Blob): Promise<void> => {
    console.log(`[MOCK] Registering face for UID: ${uid}. Blob size: ${imageBlob.size}`);
    
    // Simulate a network delay for realism.
    await new Promise(resolve => setTimeout(resolve, 750));

    const uids = getRegisteredUids();
    if (!uids.includes(uid)) {
        uids.push(uid);
        saveRegisteredUids(uids);
    }
    
    // Simulate a successful registration by resolving the promise.
    return Promise.resolve();
};

/**
 * Mocks the verification of a face.
 * @param imageBlob The live captured image of the user's face as a Blob.
 * @returns An object indicating success, and the matched UID if successful.
 */
export const verifyFace = async (imageBlob: Blob): Promise<{ success: boolean; uid?: string; message?: string }> => {
    console.log(`[MOCK] Verifying face. Blob size: ${imageBlob.size}`);
    
    // Simulate a network delay for realism.
    await new Promise(resolve => setTimeout(resolve, 1200));

    const uids = getRegisteredUids();

    if (uids.length > 0) {
        // LIMITATION: This mock cannot perform real face recognition.
        // It assumes the verification is for the most recently registered user.
        // This will work for a single user flow but may fail in multi-user scenarios.
        const lastRegisteredUid = uids[uids.length - 1];
        console.log(`[MOCK] Face "matched" with most recent UID: ${lastRegisteredUid}`);
        return Promise.resolve({ success: true, uid: lastRegisteredUid });
    } else {
        // Simulate a failure if no one has registered.
        console.log(`[MOCK] No face registered in mock service.`);
        return Promise.resolve({ success: false, message: "No face registered in the system." });
    }
};
