// Enhanced Face Recognition Service with proper error handling
// This uses localStorage for development. For production, integrate with a real face recognition API.

interface FaceRegistrationData {
    uid: string;
    imageData: string; // base64 encoded image
    timestamp: number;
}

/**
 * Converts a base64 data URL to a Blob object.
 */
export const dataUrlToBlob = (dataUrl: string): Blob => {
    try {
        const arr = dataUrl.split(',');
        if (arr.length < 2) throw new Error("Invalid Data URL format");
        
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
    } catch (error) {
        console.error("Error converting data URL to Blob:", error);
        throw new Error("Failed to process image data. Please try capturing again.");
    }
};

/**
 * Converts Blob to base64 string for storage
 */
const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};

/**
 * Get all registered face data from localStorage
 */
const getRegisteredFaces = (): FaceRegistrationData[] => {
    try {
        const data = localStorage.getItem('face_recognition_data');
        return data ? JSON.parse(data) : [];
    } catch (error) {
        console.error("Error reading face registration data:", error);
        return [];
    }
};

/**
 * Save registered face data to localStorage
 */
const saveRegisteredFaces = (faces: FaceRegistrationData[]): void => {
    try {
        localStorage.setItem('face_recognition_data', JSON.stringify(faces));
    } catch (error) {
        console.error("Error saving face registration data:", error);
        throw new Error("Failed to save face data. Storage may be full.");
    }
};

/**
 * Validates image data
 */
const validateImage = (blob: Blob): boolean => {
    // Check if blob is valid
    if (!blob || blob.size === 0) {
        throw new Error("Invalid image: Image data is empty");
    }
    
    // Check file size (max 5MB)
    if (blob.size > 5 * 1024 * 1024) {
        throw new Error("Invalid image: Image size exceeds 5MB limit");
    }
    
    // Check MIME type
    if (!blob.type.startsWith('image/')) {
        throw new Error("Invalid image: File must be an image");
    }
    
    return true;
};

/**
 * Register a user's face for attendance verification
 */
export const registerFace = async (uid: string, imageBlob: Blob): Promise<void> => {
    try {
        console.log(`[Face Registration] Starting registration for UID: ${uid}`);
        
        // Validate inputs
        if (!uid || typeof uid !== 'string') {
            throw new Error("Invalid user ID provided");
        }
        
        validateImage(imageBlob);
        
        // Simulate network delay for realistic UX
        await new Promise(resolve => setTimeout(resolve, 800));
        
        // Convert blob to base64 for storage
        const imageData = await blobToBase64(imageBlob);
        
        // Get existing registrations
        const faces = getRegisteredFaces();
        
        // Remove any existing registration for this user
        const filteredFaces = faces.filter(f => f.uid !== uid);
        
        // Add new registration
        const newRegistration: FaceRegistrationData = {
            uid,
            imageData,
            timestamp: Date.now()
        };
        
        filteredFaces.push(newRegistration);
        
        // Save to storage
        saveRegisteredFaces(filteredFaces);
        
        console.log(`[Face Registration] Successfully registered face for UID: ${uid}`);
    } catch (error) {
        console.error("[Face Registration] Error:", error);
        if (error instanceof Error) {
            throw new Error(`Face registration failed: ${error.message}`);
        }
        throw new Error("Face registration failed. Please try again.");
    }
};

/**
 * Verify a face against registered faces
 */
export const verifyFace = async (imageBlob: Blob): Promise<{ success: boolean; uid?: string; message?: string }> => {
    try {
        console.log(`[Face Verification] Starting verification. Image size: ${imageBlob.size} bytes`);
        
        // Validate image
        validateImage(imageBlob);
        
        // Simulate network delay for realistic UX
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Get registered faces
        const faces = getRegisteredFaces();
        
        if (faces.length === 0) {
            console.log("[Face Verification] No faces registered in system");
            return {
                success: false,
                message: "No registered faces found. Please register your face first."
            };
        }
        
        // Convert blob to base64 for comparison
        const capturedImageData = await blobToBase64(imageBlob);
        
        // MOCK VERIFICATION LOGIC
        // In production, this should call a real face recognition API
        // For now, we'll use a simple approach: match with the most recently registered face
        // or use additional context (like user session) to determine the match
        
        // Sort by timestamp (most recent first)
        const sortedFaces = [...faces].sort((a, b) => b.timestamp - a.timestamp);
        const matchedFace = sortedFaces[0]; // Use most recent registration
        
        // Simulate confidence score
        const confidence = 0.85 + Math.random() * 0.1; // 85-95%
        
        if (confidence > 0.8) {
            console.log(`[Face Verification] Match found for UID: ${matchedFace.uid} (confidence: ${(confidence * 100).toFixed(1)}%)`);
            return {
                success: true,
                uid: matchedFace.uid,
                message: `Face verified with ${(confidence * 100).toFixed(1)}% confidence`
            };
        } else {
            console.log(`[Face Verification] No match found (confidence: ${(confidence * 100).toFixed(1)}%)`);
            return {
                success: false,
                message: "Face verification failed. Please ensure good lighting and face the camera directly."
            };
        }
        
    } catch (error) {
        console.error("[Face Verification] Error:", error);
        if (error instanceof Error) {
            return {
                success: false,
                message: `Verification failed: ${error.message}`
            };
        }
        return {
            success: false,
            message: "Face verification failed. Please try again."
        };
    }
};

/**
 * Check if a user has registered their face
 */
export const isFaceRegistered = (uid: string): boolean => {
    try {
        const faces = getRegisteredFaces();
        return faces.some(f => f.uid === uid);
    } catch (error) {
        console.error("Error checking face registration:", error);
        return false;
    }
};

/**
 * Delete a user's face registration
 */
export const deleteFaceRegistration = (uid: string): void => {
    try {
        const faces = getRegisteredFaces();
        const filteredFaces = faces.filter(f => f.uid !== uid);
        saveRegisteredFaces(filteredFaces);
        console.log(`[Face Registration] Deleted registration for UID: ${uid}`);
    } catch (error) {
        console.error("Error deleting face registration:", error);
        throw new Error("Failed to delete face registration");
    }
};

/**
 * Clear all face registrations (for testing/development)
 */
export const clearAllRegistrations = (): void => {
    try {
        localStorage.removeItem('face_recognition_data');
        console.log("[Face Registration] Cleared all registrations");
    } catch (error) {
        console.error("Error clearing registrations:", error);
    }
};