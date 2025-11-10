import React, { createContext, useState, useContext, useMemo, useEffect, useCallback } from 'react';
import { Wallet } from 'ethers';

// --- Crypto Helper Functions using Web Crypto API ---

// Function to derive a key from a password using PBKDF2
async function getKey(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

// Function to encrypt the private key
async function encryptData(privateKey, password) {
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const key = await getKey(password, salt);
  const enc = new TextEncoder();

  const encryptedContent = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv
    },
    key,
    enc.encode(privateKey)
  );

  const encryptedBytes = new Uint8Array(encryptedContent);
  const result = new Uint8Array(salt.length + iv.length + encryptedBytes.length);
  result.set(salt, 0);
  result.set(iv, salt.length);
  result.set(encryptedBytes, salt.length + iv.length);

  return btoa(String.fromCharCode.apply(null, result)); // Store as base64
}

// Function to decrypt the private key
async function decryptData(encryptedData, password) {
  try {
    const data = atob(encryptedData);
    const dataBytes = new Uint8Array(data.length).map((_, i) => data.charCodeAt(i));
    
    const salt = dataBytes.slice(0, 16);
    const iv = dataBytes.slice(16, 28);
    const content = dataBytes.slice(28);

    const key = await getKey(password, salt);
    const decryptedContent = await window.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      key,
      content
    );

    return new TextDecoder().decode(decryptedContent);
  } catch (e) {
    console.error("Decryption failed:", e);
    throw new Error("Invalid password or corrupted data.");
  }
}

const WalletContext = createContext(null);

export function WalletProvider({ children }) {
    const [privateKey, setPrivateKey] = useState(null); // Holds the DECRYPTED key in-memory
    const [isKeyStored, setIsKeyStored] = useState(false);

    useEffect(() => {
        const storedKey = localStorage.getItem('encryptedPrivateKey');
        setIsKeyStored(!!storedKey);
    }, []);

    const wallet = useMemo(() => {
        if (privateKey) {
            try {
                if (privateKey.startsWith('0x') && privateKey.length === 66) {
                    return new Wallet(privateKey);
                }
            } catch (error) {
                console.error("Invalid private key", error);
                return null;
            }
        }
        return null;
    }, [privateKey]);

    const setAndEncryptPrivateKey = useCallback(async (pk, password) => {
        const encryptedKey = await encryptData(pk, password);
        localStorage.setItem('encryptedPrivateKey', encryptedKey);
        setPrivateKey(pk);
        setIsKeyStored(true);
    }, []);

    const unlockWallet = useCallback(async (password) => {
        const encryptedKey = localStorage.getItem('encryptedPrivateKey');
        if (!encryptedKey) throw new Error("No private key stored.");
        
        const decryptedPk = await decryptData(encryptedKey, password);
        setPrivateKey(decryptedPk);
    }, []);
    
    const lockWallet = useCallback(() => {
        setPrivateKey(null);
        // Also remove Infura key for a full logout
        sessionStorage.removeItem('botInfuraApiKey');
        localStorage.removeItem('encryptedPrivateKey');
        setIsKeyStored(false);
    }, []);

    // IMPORTANT: Expose the raw privateKey in the context value
    const value = useMemo(() => ({
        wallet,
        privateKey, // This is now available to components that use the context
        isKeyStored,
        isUnlocked: !!privateKey,
        botWalletAddress: wallet ? wallet.address : null,
        setAndEncryptPrivateKey,
        unlockWallet,
        lockWallet
    }), [wallet, privateKey, isKeyStored, setAndEncryptPrivateKey, unlockWallet, lockWallet]);

    return (
        <WalletContext.Provider value={value}>
            {children}
        </WalletContext.Provider>
    );
}

export function useWallet() {
    const context = useContext(WalletContext);
    if (!context) {
        throw new Error('useWallet must be used within a WalletProvider');
    }
    return context;
}
