"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
    Search, Map as MapIcon, X, XCircle, ZoomIn, Radar, 
    LocateFixed, List, Menu, LogIn, UserPlus, Settings, 
    Moon, Globe, Plus, Minus, ArrowLeft, Copy, CheckCircle2, 
    Info, AlertCircle, FolderOpen, PlusCircle, Droplets, Wifi, ReceiptText,
    Coffee, Utensils
} from 'lucide-react';

const CONFIG = {
    MIN_ZOOM_LEVEL: 15,
    FETCH_DELAY: 1200
};

const INITIAL_DB_PLACES = [
    { id: "db_1", name: "Pursaklar Merkez Cafe", lat: 40.0380, lng: 32.8950, type: "cafe", address: "Merkez Mah, 1. Cad No:12", toiletPass: "1923#", wifiPass: "pursaklar123", rating: 4.5, menu: [{item: "Çay", price: "₺15"}, {item: "Türk Kahvesi", price: "₺45"}], isOsmData: false },
    { id: "db_2", name: "Lezzet Lokantası", lat: 40.0400, lng: 32.8980, type: "restaurant", address: "Fatih Mah, Belediye Sk. No:5", toiletPass: "Personele sorunuz", wifiPass: null, rating: 4.2, menu: [{item: "İskender", price: "₺250"}, {item: "Mercimek Çorbası", price: "₺60"}], isOsmData: false },
    { id: "db_3", name: "Gece Kuşu Roasters", lat: 40.0350, lng: 32.8900, type: "cafe", address: "Mimar Sinan Cad. No:44", toiletPass: "8899*", wifiPass: "roast_guest", rating: 4.8, menu: [{item: "V60 / Chemex", price: "₺95"}], isOsmData: false }
];

export default function App() {
    // --- State Management ---
    const [isMounted, setIsMounted] = useState(false);
    const [isLeafletLoaded, setIsLeafletLoaded] = useState(false);
    const [dbPlaces] = useState(INITIAL_DB_PLACES);
    const [osmPlaces, setOsmPlaces] = useState([]);
    const [selectedPlaceId, setSelectedPlaceId] = useState(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [panelStatus, setPanelStatus] = useState('closed'); // 'closed', 'half', 'full'
    const [isZoomWarningVisible, setIsZoomWarningVisible] = useState(false);
    const [isFetchingVisible, setIsFetchingVisible] = useState(false);
    const [fetchingText, setFetchingText] = useState("Bölge taranıyor...");
    const [isDarkMode, setIsDarkMode] = useState(false);
    
    // UI Toggles
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [authMode, setAuthMode] = useState(null); // null, 'login', 'register'
    const [isFullMenuOpen, setIsFullMenuOpen] = useState(false);

    // Toast
    const [toast, setToast] = useState({ message: '', submessage: '', type: 'success', visible: false });

    // --- Refs ---
    const mapContainerRef = useRef(null);
    const mapRef = useRef(null);
    const markersRef = useRef(new Map()); 
    const fetchTimeoutRef = useRef(undefined); 
    const userMarkerRef = useRef(null);
    const panelRef = useRef(null);
    const startYRef = useRef(0);
    const startTranslateYRef = useRef(100);

    const SNAP_POINTS = { full: 0, half: 45, closed: 100 };

    // --- Component Mount (SSR Guard & Leaflet Loader & Theme Init) ---
    useEffect(() => {
        setIsMounted(true);
        
        // Akıllı Tema Yükleme: Önce localStorage'a bak, yoksa sistem tercihini kullan
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark' || (!savedTheme && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
            setIsDarkMode(true);
            document.documentElement.classList.add('dark');
        } else {
            setIsDarkMode(false);
            document.documentElement.classList.remove('dark');
        }

        if (!document.getElementById('leaflet-css')) {
            const link = document.createElement('link');
            link.id = 'leaflet-css';
            link.rel = 'stylesheet';
            link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
            document.head.appendChild(link);
        }

        if (!document.getElementById('leaflet-js')) {
            const script = document.createElement('script');
            script.id = 'leaflet-js';
            script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
            script.async = true;
            script.onload = () => setIsLeafletLoaded(true);
            document.head.appendChild(script);
        } else {
            const checkReady = setInterval(() => {
                if (window.L) {
                    setIsLeafletLoaded(true);
                    clearInterval(checkReady);
                }
            }, 100);
        }
    }, []);

    // --- Tema Değiştirme Fonksiyonu ---
    const handleThemeToggle = (e) => {
        const isDark = e.target.checked;
        setIsDarkMode(isDark);
        if (isDark) {
            document.documentElement.classList.add('dark');
            localStorage.setItem('theme', 'dark');
            showToast("Karanlık tema aktif.", "", "info");
        } else {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('theme', 'light');
            showToast("Aydınlık tema aktif.", "", "info");
        }
    };

    // --- Toast Function ---
    const showToast = useCallback((message, submessage = "", type = "success") => {
        setToast({ message, submessage, type, visible: true });
        window.setTimeout(() => {
            setToast(prev => ({ ...prev, visible: false }));
        }, 4500);
    }, []);

    // --- Helper: Get All Places ---
    const allPlaces = useMemo(() => {
        return [...dbPlaces, ...osmPlaces];
    }, [dbPlaces, osmPlaces]);

    // --- Leaflet & Map Initialization ---
    useEffect(() => {
        if (!isMounted || !isLeafletLoaded || !mapContainerRef.current || mapRef.current) return;

        const L = window.L;

        const map = L.map(mapContainerRef.current, { zoomControl: false }).setView([39.92077, 32.85411], 6);
        mapRef.current = map;

        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors',
            subdomains: 'abcd',
            maxZoom: 20
        }).addTo(map);

        map.on('moveend', handleMapMove);
        map.on('zoomend', handleZoomChange);

        handleZoomChange();

        window.setTimeout(() => locateUser(), 1000);

        return () => {
            map.remove();
            mapRef.current = undefined;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isMounted, isLeafletLoaded]);

    // --- Markers Rendering ---
    useEffect(() => {
        if (!isMounted || !isLeafletLoaded || !mapRef.current) return;
        const L = window.L;

        markersRef.current.forEach((marker) => {
            if (mapRef.current) mapRef.current.removeLayer(marker);
        });
        markersRef.current.clear();

        if (mapRef.current.getZoom() < CONFIG.MIN_ZOOM_LEVEL) return;

        const filtered = allPlaces.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()));

        filtered.sort((a, b) => (a.isOsmData === b.isOsmData) ? 0 : a.isOsmData ? -1 : 1);

        filtered.forEach(place => {
            const isCafe = place.type === 'cafe' || place.type === 'fast_food';
            const iconClass = place.isOsmData ? 'marker-osm' : (isCafe ? 'marker-cafe' : 'marker-restaurant');
            
            const coffeeSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" x2="6" y1="2" y2="4"/><line x1="10" x2="10" y1="2" y2="4"/><line x1="14" x2="14" y1="2" y2="4"/></svg>`;
            const utensilsSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg>`;

            const customIcon = L.divIcon({
                className: 'custom-div-icon',
                html: `<div class="custom-marker ${iconClass} ${place.id === selectedPlaceId ? 'scale-125 border-gray-800 dark:border-white' : ''}" style="width: ${place.isOsmData ? '26px' : '32px'}; height: ${place.isOsmData ? '26px' : '32px'};">
                         ${isCafe ? coffeeSvg : utensilsSvg}
                       </div>`,
                iconSize: [32, 32],
                iconAnchor: [16, 16]
            });

            const marker = L.marker([place.lat, place.lng], { icon: customIcon }).addTo(mapRef.current);
            
            marker.bindTooltip(place.name, {
                direction: 'top',
                offset: [0, place.isOsmData ? -10 : -14],
                className: 'custom-tooltip',
                opacity: 1
            });
            
            marker.on('click', () => handleSelectPlace(place.id));
            markersRef.current.set(place.id, marker);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isMounted, isLeafletLoaded, allPlaces, searchQuery, selectedPlaceId, isZoomWarningVisible]);

    // --- Logic Functions ---
    const handleZoomChange = () => {
        if (!mapRef.current) return;
        setIsZoomWarningVisible(mapRef.current.getZoom() < CONFIG.MIN_ZOOM_LEVEL);
    };

    const handleMapMove = () => {
        if (!mapRef.current) return;
        if (fetchTimeoutRef.current) window.clearTimeout(fetchTimeoutRef.current);
        
        if (mapRef.current.getZoom() < CONFIG.MIN_ZOOM_LEVEL) {
            setOsmPlaces([]);
            return;
        }

        setFetchingText("Bölge taranıyor...");
        fetchTimeoutRef.current = window.setTimeout(() => fetchOsmData(0), CONFIG.FETCH_DELAY);
    };

    const fetchOsmData = async (retryCount = 0) => {
        if (!mapRef.current) return;
        const bounds = mapRef.current.getBounds();
        const s = bounds.getSouth(), w = bounds.getWest(), n = bounds.getNorth(), e = bounds.getEast();

        const url = `/api/places?s=${s}&w=${w}&n=${n}&e=${e}&retry=${retryCount}`;
        setIsFetchingVisible(true);

        try {
            const response = await fetch(url);
            
            if (!response.ok) {
                if (retryCount < 3) {
                    console.warn(`API Hatası (${response.status}). Farklı bir sunucu deneniyor... (Deneme: ${retryCount + 1})`);
                    setFetchingText("Farklı sunucu deneniyor...");
                    fetchTimeoutRef.current = window.setTimeout(() => fetchOsmData(retryCount + 1), 1000);
                    return; 
                } else {
                    throw new Error(`HTTP ${response.status} kalıcı hatası. Yeniden deneme limiti aşıldı.`);
                }
            }
            
            const data = await response.json();
            const newOsmPlaces = [];
            
            if (data && data.elements) {
                data.elements.forEach(node => {
                    const isDuplicate = dbPlaces.some(dbPlace => {
                        const map = mapRef.current;
                        return map && map.distance([dbPlace.lat, dbPlace.lng], [node.lat, node.lon]) < 30;
                    });

                    if (!isDuplicate && node.tags && node.tags.name) {
                        let type = 'cafe';
                        if (node.tags.amenity === 'restaurant' || node.tags.amenity === 'fast_food') type = 'restaurant';
                        
                        newOsmPlaces.push({
                            id: `osm_${node.id}`,
                            name: node.tags.name,
                            lat: node.lat,
                            lng: node.lon,
                            type: type,
                            address: "Adres bilgisi girilmemiş",
                            isOsmData: true
                        });
                    }
                });
            }

            setOsmPlaces(newOsmPlaces);
            setIsFetchingVisible(false); 
        } catch (error) {
            console.warn("API Fetch Hatası. İşlem tamamlanamadı.");
            setIsFetchingVisible(false); 
        }
    };

    const applyLocation = (lat, lng, message, submessage, type) => {
        if (!mapRef.current || !window.L) return;
        const L = window.L;

        if (userMarkerRef.current) {
            mapRef.current.removeLayer(userMarkerRef.current);
        }
        
        const userIcon = L.divIcon({
            className: 'custom-user-icon',
            html: `<div class="user-location-marker"></div>`,
            iconSize: [16, 16],
            iconAnchor: [8, 8]
        });
        
        userMarkerRef.current = L.marker([lat, lng], { icon: userIcon, zIndexOffset: 2000 }).addTo(mapRef.current);
        mapRef.current.flyTo([lat, lng], 15, { animate: true, duration: 1.5 });
        
        if(message) showToast(message, submessage, type);
    };

    const locateUserViaIP = () => {
        fetch('https://get.geojs.io/v1/ip/geo.json')
            .then(res => res.json())
            .then(data => {
                applyLocation(parseFloat(data.latitude), parseFloat(data.longitude), "Yaklaşık konumunuz bulundu", "Cihaz kısıtlaması nedeniyle IP tabanlı bölge kullanıldı.", "info");
            })
            .catch(() => {
                console.warn("IP Location engellendi. Varsayılan konuma gidiliyor.");
                applyLocation(40.0380, 32.8950, "Önizleme Ortamı", "Tarayıcı güvenliği nedeniyle varsayılan konuma gidildi.", "info");
            });
    };

    const locateUser = async () => {
        const isSecure = window.isSecureContext || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        
        if (!navigator.geolocation || !isSecure) {
            locateUserViaIP();
            return;
        }

        try {
            if (navigator.permissions && navigator.permissions.query) {
                const permissionStatus = await navigator.permissions.query({ name: 'geolocation' });
                if (permissionStatus.state === 'denied') {
                    showToast("Konum İzni Yok", "Tarayıcı ayarlarından bu siteye konum izni verin.", "error");
                    return;
                }
            }
        } catch {
            // Permissions API desteklenmiyorsa sessizce yoksay
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                applyLocation(position.coords.latitude, position.coords.longitude, "Tam konumunuz bulundu!", "", "success");
            },
            () => {
                locateUserViaIP();
            },
            { enableHighAccuracy: false, maximumAge: 60000 } 
        );
    };

    const handleSelectPlace = (id) => {
        setSelectedPlaceId(id);
        const place = allPlaces.find(p => p.id === id);
        
        if (place && mapRef.current) {
            const targetZoom = 17;
            if (window.innerWidth < 768) {
                let targetPoint = mapRef.current.project([place.lat, place.lng], targetZoom);
                targetPoint.y -= window.innerHeight * -0.25; 
                const targetLatLng = mapRef.current.unproject(targetPoint, targetZoom);
                mapRef.current.setView(targetLatLng, targetZoom, { animate: true, duration: 0.5 });
            } else {
                mapRef.current.setView([place.lat, place.lng], targetZoom, { animate: true, duration: 0.5 });
            }
        }

        if (window.innerWidth < 768 && panelStatus === 'closed') {
            updatePanelState('half');
        }
    };

    const clearSelection = () => {
        setSelectedPlaceId(null);
    };

    const copyToClipboard = (text) => {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        document.body.appendChild(textarea);
        textarea.select();
        try { 
            document.execCommand('copy'); 
            showToast(`Kopyalandı: ${text}`, "", "success"); 
        } catch (err) { 
            console.error('Kopyalama Hatası', err); 
        } finally { 
            document.body.removeChild(textarea); 
        }
    };

    // --- Drag Logic ---
    const updatePanelState = (status) => {
        setPanelStatus(status);
        if (window.innerWidth >= 768 || !panelRef.current) {
            if(panelRef.current) {
                panelRef.current.style.transform = '';
                panelRef.current.style.transition = '';
            }
            return;
        }

        panelRef.current.style.transition = 'transform 0.4s cubic-bezier(0.32, 0.72, 0, 1)';
        
        if (status === 'closed') {
            panelRef.current.style.transform = `translateY(${SNAP_POINTS.closed}%)`;
            if (document.activeElement) document.activeElement.blur();
        } else if (status === 'half') {
            panelRef.current.style.transform = `translateY(${SNAP_POINTS.half}%)`;
        } else if (status === 'full') {
            panelRef.current.style.transform = `translateY(${SNAP_POINTS.full}%)`;
        }
    };

    const onTouchStart = (e) => {
        if (window.innerWidth >= 768 || !panelRef.current) return;
        startYRef.current = e.touches[0].clientY;
        panelRef.current.style.transition = 'none';
        
        if (panelStatus === 'closed') startTranslateYRef.current = SNAP_POINTS.closed;
        else if (panelStatus === 'half') startTranslateYRef.current = SNAP_POINTS.half;
        else if (panelStatus === 'full') startTranslateYRef.current = SNAP_POINTS.full;
    };

    const onTouchMove = (e) => {
        if (window.innerWidth >= 768 || !startYRef.current || !panelRef.current) return;
        const currentY = e.touches[0].clientY;
        const deltaY = currentY - startYRef.current;
        const deltaPercent = (deltaY / window.innerHeight) * 100;
        
        let newTranslateY = startTranslateYRef.current + deltaPercent;
        if (newTranslateY < 0) newTranslateY = 0;
        if (newTranslateY > 100) newTranslateY = 100;
        
        panelRef.current.style.transform = `translateY(${newTranslateY}%)`;
        if (e.target.closest('#drag-header')) {
            e.preventDefault(); 
        }
    };

    const onTouchEnd = (e) => {
        if (window.innerWidth >= 768 || !startYRef.current) return;
        const currentY = e.changedTouches[0].clientY;
        const deltaY = currentY - startYRef.current;
        const finalY = startTranslateYRef.current + ((deltaY / window.innerHeight) * 100);
        startYRef.current = 0; 
        
        if (finalY < 25) updatePanelState('full');
        else if (finalY > 75) updatePanelState('closed');
        else updatePanelState('half');
    };

    const openPanelAndFocus = () => {
        if (selectedPlaceId) clearSelection(); 
        updatePanelState('full');
        window.setTimeout(() => {
            const input = document.getElementById('real-search-input');
            if(input) {
                input.focus();
                input.setSelectionRange(input.value.length, input.value.length);
            }
        }, 400);
    };

    const allPlacesList = allPlaces.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase())).sort((a, b) => (a.isOsmData === b.isOsmData) ? 0 : a.isOsmData ? 1 : -1);
    const activePlace = selectedPlaceId ? allPlaces.find(p => p.id === selectedPlaceId) : null;

    if (!isMounted) return null;

    return (
        <div className="antialiased overflow-hidden w-screen h-screen flex flex-col md:flex-row font-sans relative transition-colors duration-300 bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200">
            
            {/* Custom Leaflet Dark Mode CSS Injection */}
            <style dangerouslySetInnerHTML={{__html: `
                .leaflet-control-zoom { border: none !important; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1) !important; }
                .leaflet-control-zoom a { color: #4b5563 !important; }
                .custom-marker { display: flex; align-items: center; justify-content: center; border-radius: 50%; border: 2px solid white; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2); font-size: 14px; transition: transform 0.2s; }
                .custom-marker:hover { transform: scale(1.1); z-index: 1000 !important; }
                .marker-cafe { background-color: #d97706; color: white; }
                .marker-restaurant { background-color: #ea580c; color: white; }
                .marker-osm { background-color: #ffffff; color: #9ca3af; border-color: #e5e7eb; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                .user-location-marker { background-color: #3b82f6; width: 16px; height: 16px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 10px rgba(59, 130, 246, 0.5); animation: pulse-blue 2s infinite; }
                @keyframes pulse-blue { 0% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.7); } 70% { box-shadow: 0 0 0 10px rgba(59, 130, 246, 0); } 100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); } }
                @keyframes pulse-light { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
                .fetching-indicator { animation: pulse-light 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
                .leaflet-tooltip.custom-tooltip { background-color: #1f2937; color: white; border: none; border-radius: 0.5rem; padding: 0.35rem 0.75rem; font-weight: 600; font-size: 0.75rem; font-family: inherit; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
                .leaflet-tooltip.custom-tooltip.leaflet-tooltip-top:before { border-top-color: #1f2937; }
                
                .dark .leaflet-layer, .dark .leaflet-control-attribution { filter: invert(100%) hue-rotate(180deg) brightness(95%) contrast(90%); }
                .dark .custom-marker { filter: invert(0) hue-rotate(0) brightness(100%) contrast(100%); }
                .dark .leaflet-tooltip.custom-tooltip { background-color: #f3f4f6; color: #111827; }
                .dark .leaflet-tooltip.custom-tooltip.leaflet-tooltip-top:before { border-top-color: #f3f4f6; }
            `}} />

            {/* TOAST */}
            <div className={`fixed top-4 left-1/2 transform -translate-x-1/2 bg-gray-800 dark:bg-white dark:text-gray-900 text-white px-4 py-3 rounded-2xl shadow-lg pointer-events-none transition-opacity duration-300 z-[6000] flex items-start gap-3 w-[90vw] md:w-auto max-w-sm ${toast.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}>
                {toast.type === 'success' && <CheckCircle2 className="text-green-400 shrink-0 text-lg mt-0.5" />}
                {toast.type === 'info' && <Info className="text-blue-400 shrink-0 text-lg mt-0.5" />}
                {toast.type === 'error' && <AlertCircle className="text-red-400 shrink-0 text-lg mt-0.5" />}
                <div className="flex flex-col">
                    <span className="text-sm font-medium">{toast.message}</span>
                    {toast.submessage && <span className="text-[11px] text-gray-300 dark:text-gray-500 mt-0.5">{toast.submessage}</span>}
                </div>
            </div>

            {/* SIDEBAR / BOTTOM SHEET */}
            <div 
                ref={panelRef}
                className={`absolute bottom-0 left-0 w-full h-[100dvh] md:h-full md:w-[400px] md:relative bg-white dark:bg-gray-900 shadow-[0_-4px_20px_rgba(0,0,0,0.1)] dark:shadow-none md:shadow-xl z-[1000] flex flex-col rounded-t-3xl md:rounded-none md:border-r border-gray-200 dark:border-gray-800 transform ${panelStatus === 'closed' ? 'translate-y-[100%]' : panelStatus === 'half' ? 'translate-y-[45%]' : 'translate-y-0'} md:translate-y-0 transition-transform duration-300`}
            >
                <div 
                    id="drag-header" 
                    className="shrink-0 md:cursor-default cursor-grab active:cursor-grabbing relative bg-white dark:bg-gray-900 z-20 rounded-t-3xl md:rounded-none transition-colors duration-300 touch-none"
                    onTouchStart={onTouchStart}
                    onTouchMove={onTouchMove}
                    onTouchEnd={onTouchEnd}
                >
                    <div className="w-full flex justify-center pt-4 pb-2 md:hidden">
                        <div className="w-12 h-1.5 bg-gray-300 dark:bg-gray-700 rounded-full"></div>
                    </div>

                    <div className="px-6 py-3 md:py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between pointer-events-none md:pointer-events-auto">
                        <div className="flex items-center gap-2">
                            <div className="bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-500 p-2 rounded-lg">
                                <MapIcon size={20} />
                            </div>
                            <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">kaf&apos;<span className="text-amber-600 dark:text-amber-500">map</span></h1>
                        </div>
                        <button className="md:hidden text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 pointer-events-auto p-2" onClick={() => updatePanelState('closed')}>
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Search Bar Container */}
                <div className={`px-6 py-3 bg-white dark:bg-gray-900 shrink-0 border-b border-gray-100 dark:border-gray-800 z-10 transition-colors duration-300 ${selectedPlaceId ? 'hidden' : 'block'}`}>
                    <div className="relative">
                        <input type="text" id="real-search-input" placeholder="Kafe, restoran veya adres ara..." 
                               value={searchQuery}
                               onChange={(e) => setSearchQuery(e.target.value)}
                               className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl py-3 pl-11 pr-10 focus:ring-2 focus:ring-amber-500 transition-all outline-none shadow-inner text-gray-800 dark:text-white font-medium placeholder-gray-400 dark:placeholder-gray-500" />
                        <Search className="absolute left-4 top-3.5 text-gray-400 dark:text-gray-500" size={18} />
                        {searchQuery && (
                            <button className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 transition-colors" onClick={() => setSearchQuery("")}>
                                <XCircle size={20} />
                            </button>
                        )}
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto relative pb-10 bg-gray-50 dark:bg-gray-900/50 md:bg-white md:dark:bg-gray-900 transition-colors duration-300" style={{ touchAction: 'pan-y' }}>
                    {activePlace ? (
                        activePlace.isOsmData ? (
                            /* EMPTY OSM DATA VIEW */
                            <div className="animate-fade-in relative bg-white dark:bg-gray-900 h-full">
                                <div className="h-24 bg-gray-200 dark:bg-gray-800 relative overflow-hidden">
                                    <div className="absolute inset-0 opacity-10 dark:opacity-5" style={{ backgroundImage: 'repeating-linear-gradient(45deg, #000 0, #000 2px, transparent 2px, transparent 8px)' }}></div>
                                    <button onClick={clearSelection} className="absolute top-4 left-4 bg-white/50 dark:bg-gray-900/50 hover:bg-white/80 dark:hover:bg-gray-900/80 text-gray-700 dark:text-gray-200 w-8 h-8 rounded-full flex items-center justify-center transition-colors z-10">
                                        <ArrowLeft size={16} />
                                    </button>
                                </div>
                                <div className="px-6 pb-6 relative -mt-8 flex flex-col items-center text-center">
                                    <div className="w-16 h-16 bg-white dark:bg-gray-800 rounded-full p-1 shadow-md flex items-center justify-center mb-4 border border-gray-100 dark:border-gray-700">
                                        <div className="w-full h-full rounded-full flex items-center justify-center bg-gray-50 dark:bg-gray-700 text-gray-400 dark:text-gray-300">
                                            {/* We use emojis or simple text as fallback since we don't import custom SVG components for every icon type */}
                                            {activePlace.type === 'cafe' ? <span className="text-2xl">☕</span> : <span className="text-2xl">🍴</span>}
                                        </div>
                                    </div>
                                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white leading-tight">{activePlace.name}</h2>
                                    <span className="inline-block bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider mt-2 border border-gray-200 dark:border-gray-700">Kayıtsız Mekan</span>
                                    
                                    <div className="mt-8 mb-8 p-6 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 w-full flex flex-col items-center">
                                        <FolderOpen className="text-gray-400 dark:text-gray-500 mb-3" size={32} />
                                        <h3 className="text-base font-bold text-gray-800 dark:text-gray-200 mb-1">Henüz Bilgi Girilmemiş</h3>
                                        <p className="text-sm text-gray-500 dark:text-gray-400">Bu mekanın tuvalet şifresi, wifi bilgisi veya menü fiyatları sistemimizde bulunmuyor.</p>
                                    </div>
                                    <button className="w-full bg-amber-600 hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600 text-white font-bold py-3.5 rounded-xl transition-all shadow-[0_4px_14px_0_rgba(217,119,6,0.39)] dark:shadow-[0_4px_14px_0_rgba(245,158,11,0.3)] flex items-center justify-center gap-2 transform hover:-translate-y-0.5">
                                        <PlusCircle size={18} /> İlk Ekleyen Sen Ol
                                    </button>
                                </div>
                            </div>
                        ) : (
                            /* NORMAL DB PLACE VIEW */
                            <div className="animate-fade-in relative bg-white dark:bg-gray-900 min-h-full">
                                <div className={`h-32 bg-gradient-to-r relative ${activePlace.type === 'cafe' ? 'from-amber-400 to-orange-500 dark:from-amber-600 dark:to-orange-700' : 'from-orange-500 to-red-500 dark:from-orange-600 dark:to-red-700'}`}>
                                    <button onClick={clearSelection} className="absolute top-4 left-4 bg-black/20 hover:bg-black/40 text-white w-8 h-8 rounded-full flex items-center justify-center transition-colors">
                                        <ArrowLeft size={16} />
                                    </button>
                                </div>
                                <div className="px-6 pb-6 relative -mt-6">
                                    <div className="w-14 h-14 bg-white dark:bg-gray-800 rounded-full p-1 shadow-lg flex items-center justify-center mb-3">
                                        <div className={`w-full h-full rounded-full flex items-center justify-center ${activePlace.type === 'cafe' ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-500' : 'bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-500'}`}>
                                            {activePlace.type === 'cafe' ? <span className="text-xl">☕</span> : <span className="text-xl">🍴</span>}
                                        </div>
                                    </div>
                                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white leading-tight">{activePlace.name}</h2>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-1">
                                        <MapIcon size={14} className="text-gray-400 dark:text-gray-500" /> {activePlace.address}
                                    </p>

                                    <div className="grid grid-cols-2 gap-3 mt-6">
                                        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 relative overflow-hidden">
                                            <Droplets className="absolute -right-2 -top-2 text-blue-100 dark:text-blue-800/50 opacity-50" size={60} />
                                            <div className="relative z-10">
                                                <p className="text-[10px] sm:text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wide mb-1">Tuvalet Şifresi</p>
                                                <div className="flex items-center justify-between">
                                                    <p className="text-sm sm:text-lg font-mono font-bold text-gray-900 dark:text-white truncate">{activePlace.toiletPass || '-'}</p>
                                                    {activePlace.toiletPass && activePlace.toiletPass !== 'Personele sorunuz' && (
                                                        <button onClick={() => copyToClipboard(activePlace.toiletPass)} className="text-blue-500 dark:text-blue-400 bg-white dark:bg-gray-800 rounded-md p-1.5 shadow-sm ml-1 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"><Copy size={14} /></button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4 relative overflow-hidden">
                                            <Wifi className="absolute -right-2 -top-2 text-green-100 dark:text-green-800/50 opacity-50" size={60} />
                                            <div className="relative z-10">
                                                <p className="text-[10px] sm:text-xs font-bold text-green-600 dark:text-green-400 uppercase tracking-wide mb-1">Ücretsiz WiFi</p>
                                                <div className="flex items-center justify-between">
                                                    <p className="text-sm font-mono font-bold text-gray-900 dark:text-white truncate">{activePlace.wifiPass || 'Yok'}</p>
                                                    {activePlace.wifiPass && (
                                                        <button onClick={() => copyToClipboard(activePlace.wifiPass)} className="text-green-600 dark:text-green-400 bg-white dark:bg-gray-800 rounded-md p-1.5 shadow-sm ml-1 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"><Copy size={14} /></button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-8">
                                        <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wide mb-4">Menüden Seçmeler</h3>
                                        <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl p-4 shadow-sm mb-3">
                                            {activePlace.menu?.slice(0, 3).map((item, idx) => (
                                                <div key={idx} className="flex justify-between items-center py-2 border-b border-gray-50 dark:border-gray-700/50 last:border-0">
                                                    <span className="text-gray-700 dark:text-gray-300">{item.item}</span>
                                                    <span className="font-semibold text-gray-900 dark:text-white">{item.price}</span>
                                                </div>
                                            ))}
                                            {activePlace.menu?.length > 3 && (
                                                <div className="text-center text-xs text-gray-400 dark:text-gray-500 mt-2 italic">+ {activePlace.menu.length - 3} ürün daha</div>
                                            )}
                                            {(!activePlace.menu || activePlace.menu.length === 0) && (
                                                <div className="text-sm text-gray-500 text-center py-2">Henüz menü eklenmemiş.</div>
                                            )}
                                        </div>
                                        {activePlace.menu?.length > 0 && (
                                            <button onClick={() => setIsFullMenuOpen(true)} className="w-full py-3 text-sm font-bold text-amber-700 dark:text-amber-500 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/40 rounded-xl transition-colors flex items-center justify-center gap-2 border border-amber-100 dark:border-amber-900/50">
                                                <List size={16} /> Tüm Menüyü Gör
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )
                    ) : (
                        /* LIST VIEW */
                        <div className="px-6 py-4">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Mekan Listesi</h2>
                                <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">{allPlacesList.length} sonuç</span>
                            </div>
                            <div className="space-y-3">
                                {allPlacesList.length === 0 && (
                                    <div className="text-center text-gray-500 py-10 text-sm flex flex-col items-center">
                                        <Search className="text-gray-300 dark:text-gray-600 mb-3" size={32} />
                                        Aramanıza uygun mekan bulunamadı.<br/>
                                        <span className="text-xs text-gray-400 dark:text-gray-500 mt-2 block">Haritada farklı bölgelere kaydırarak yeni mekanlar keşfedebilirsiniz.</span>
                                    </div>
                                )}
                                {allPlacesList.map(place => {
                                    const isCafe = place.type === 'cafe' || place.type === 'fast_food';
                                    if (place.isOsmData) {
                                        return (
                                            <div key={place.id} onClick={() => handleSelectPlace(place.id)} className="group cursor-pointer bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl p-3 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm transition-all flex items-center gap-4 opacity-80">
                                                <div className="w-8 h-8 rounded-full border border-gray-200 dark:border-gray-600 flex items-center justify-center shrink-0 bg-gray-50 dark:bg-gray-700 text-gray-400 dark:text-gray-300">
                                                    {isCafe ? <Coffee size={14} /> : <Utensils size={14} />}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <h3 className="font-medium text-sm text-gray-700 dark:text-gray-200 truncate group-hover:text-gray-900 dark:group-hover:text-white transition-colors">{place.name}</h3>
                                                    <div className="flex gap-2 mt-1">
                                                        <span className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Kayıtsız Mekan</span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    } else {
                                        return (
                                            <div key={place.id} onClick={() => handleSelectPlace(place.id)} className="group cursor-pointer bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl p-4 hover:border-amber-200 dark:hover:border-amber-600 hover:shadow-md transition-all flex items-start gap-4">
                                                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isCafe ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-500' : 'bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-500'}`}>
                                                    {isCafe ? <Coffee size={20} /> : <Utensils size={20} />}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <h3 className="font-semibold text-gray-900 dark:text-white truncate group-hover:text-amber-700 dark:group-hover:text-amber-500 transition-colors">{place.name}</h3>
                                                    <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{place.address}</p>
                                                    <div className="flex gap-2 mt-2">
                                                        <span className="text-[9px] font-bold text-gray-500 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded flex items-center gap-1">★ {place.rating}</span>
                                                        {place.toiletPass && <span className="text-[9px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded flex items-center gap-1"><Droplets size={10} /> Şifre</span>}
                                                        {place.menu && place.menu.length > 0 && <span className="text-[9px] font-bold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-1.5 py-0.5 rounded flex items-center gap-1"><ReceiptText size={10}/> Menü</span>}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    }
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* MAP AREA */}
            <div className="flex-1 w-full h-full z-0 relative">
                <div ref={mapContainerRef} className="w-full h-full" />

                <div className="absolute top-6 left-1/2 transform -translate-x-1/2 z-[500] flex flex-col gap-2 items-center pointer-events-none">
                    <div className={`bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm px-5 py-2.5 rounded-full shadow-md border border-gray-100 dark:border-gray-700 items-center gap-2 transition-opacity pointer-events-auto text-gray-700 dark:text-gray-200 ${isZoomWarningVisible ? 'flex' : 'hidden'}`}>
                        <ZoomIn className="text-amber-600" size={16} />
                        <span className="text-sm font-semibold">Yeni mekanları görmek için yakınlaştırın</span>
                    </div>
                    <div className={`bg-gray-900/80 dark:bg-white/90 backdrop-blur-sm text-white dark:text-gray-900 px-4 py-1.5 rounded-full shadow-md items-center gap-2 transition-opacity fetching-indicator pointer-events-auto ${isFetchingVisible ? 'flex' : 'hidden'}`}>
                        <Radar size={12} className={fetchingText.includes("yoğun") || fetchingText.includes("bekleniyor") ? "animate-pulse text-amber-400" : ""} />
                        <span className="text-xs font-medium">{fetchingText}</span>
                    </div>
                </div>

                {/* Burger Menu Button */}
                <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="absolute top-4 right-4 z-[2000] bg-white dark:bg-gray-800 w-[42px] h-[42px] rounded-xl shadow-md text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center justify-center border border-gray-200 dark:border-gray-700 focus:outline-none transition-colors">
                    <Menu size={20} />
                </button>

                {/* Main Menu Dropdown */}
                {isMenuOpen && <div className="fixed inset-0 z-[2500]" onClick={() => setIsMenuOpen(false)} />}
                <div className={`absolute top-16 right-4 w-56 bg-white dark:bg-gray-800 rounded-xl shadow-xl z-[3000] transform transition-all duration-200 origin-top-right border border-gray-100 dark:border-gray-700 ${isMenuOpen ? 'scale-100 opacity-100 pointer-events-auto' : 'scale-95 opacity-0 pointer-events-none'}`}>
                    <div className="py-2 flex flex-col">
                        <button className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 text-left w-full transition-colors text-gray-700 dark:text-gray-200" onClick={() => { setIsMenuOpen(false); setAuthMode('login'); }}>
                            <LogIn size={18} className="text-amber-600" />
                            <span className="font-medium text-sm">Giriş Yap</span>
                        </button>
                        <button className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 text-left w-full transition-colors text-gray-700 dark:text-gray-200" onClick={() => { setIsMenuOpen(false); setAuthMode('register'); }}>
                            <UserPlus size={18} className="text-amber-600" />
                            <span className="font-medium text-sm">Kayıt Ol</span>
                        </button>
                        <div className="h-px bg-gray-100 dark:bg-gray-700 my-1"></div>
                        <button onClick={() => { setIsMenuOpen(false); setIsSettingsOpen(true); }} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 text-left w-full transition-colors text-gray-700 dark:text-gray-200">
                            <Settings size={18} className="text-gray-400" />
                            <span className="font-medium text-sm">Ayarlar</span>
                        </button>
                    </div>
                </div>

                {/* Right Bottom Controls */}
                <div className="absolute bottom-24 md:bottom-8 right-4 z-[500] flex flex-col gap-3">
                    <button onClick={locateUser} className="bg-white dark:bg-gray-800 w-[42px] h-[42px] rounded-xl shadow-md text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center justify-center border border-gray-200 dark:border-gray-700 focus:outline-none transition-colors" title="Konumuma Git">
                        <LocateFixed size={20} />
                    </button>
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden">
                        <button onClick={() => mapRef.current?.zoomIn()} className="w-[42px] h-[42px] flex items-center justify-center text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors border-b border-gray-100 dark:border-gray-700 focus:outline-none" title="Yakınlaştır">
                            <Plus size={18} />
                        </button>
                        <button onClick={() => mapRef.current?.zoomOut()} className="w-[42px] h-[42px] flex items-center justify-center text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors focus:outline-none" title="Uzaklaştır">
                            <Minus size={18} />
                        </button>
                    </div>
                </div>

                {/* Mobile Fake Search Button */}
                <button onClick={openPanelAndFocus} className={`md:hidden absolute bottom-8 left-1/2 transform -translate-x-1/2 z-[500] w-[90%] max-w-sm bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 px-5 py-3.5 rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-gray-100 dark:border-gray-700 flex items-center gap-3 transition-all duration-300 origin-bottom hover:bg-gray-50 ${panelStatus !== 'closed' ? 'scale-0 opacity-0 hidden' : ''}`}>
                    <Search className="text-amber-600 ml-1" size={18} />
                    <span className="font-medium text-gray-500 dark:text-gray-400 text-[15px]">Kaf&apos;map&apos;te arayın...</span>
                </button>
            </div>

            {/* AUTH MODAL */}
            <div className={`fixed inset-0 bg-black/50 z-[4000] transition-opacity duration-300 flex items-center justify-center backdrop-blur-sm px-4 ${authMode ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
                <div className={`bg-white dark:bg-gray-800 w-full max-w-sm rounded-2xl shadow-2xl transform transition-transform duration-300 p-6 flex flex-col border border-gray-100 dark:border-gray-700 ${authMode ? 'scale-100' : 'scale-95'}`}>
                    <div className="flex justify-between items-center pb-4 border-b border-gray-100 dark:border-gray-700 mb-5">
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white flex items-center">
                            {authMode === 'login' ? <LogIn className="text-amber-600 mr-2" size={20} /> : <UserPlus className="text-amber-600 mr-2" size={20} />}
                            {authMode === 'login' ? 'Giriş Yap' : 'Kayıt Ol'}
                        </h3>
                        <button onClick={() => setAuthMode(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700">
                            <X size={20} />
                        </button>
                    </div>
                    
                    <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); setAuthMode(null); showToast(authMode === 'login' ? "Giriş başarılı!" : "Hesap oluşturuldu", "Hoş geldiniz.", "success"); e.target.reset(); }}>
                        <button type="button" onClick={() => { setAuthMode(null); showToast("Google ile giriş başarılı!", "Hoş geldiniz.", "success"); }} className="w-full py-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-bold rounded-xl transition-colors flex items-center justify-center gap-3 shadow-sm">
                            <svg className="w-5 h-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/><path d="M1 1h22v22H1z" fill="none"/></svg>
                            Google ile {authMode === 'login' ? 'Giriş Yap' : 'Devam Et'}
                        </button>
                        
                        <div className="flex items-center my-1">
                            <div className="flex-1 border-t border-gray-200 dark:border-gray-700"></div>
                            <span className="px-3 text-xs text-gray-400 dark:text-gray-500 font-medium">veya e-posta ile</span>
                            <div className="flex-1 border-t border-gray-200 dark:border-gray-700"></div>
                        </div>

                        {authMode === 'register' && (
                            <div className="flex flex-col gap-1.5">
                                <input type="text" placeholder="Ad Soyad" required className="w-full bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-3 focus:ring-2 focus:ring-amber-500 outline-none text-gray-800 dark:text-white transition-all shadow-inner" />
                            </div>
                        )}
                        <div className="flex flex-col gap-1.5">
                            <input type="email" placeholder="E-posta" required className="w-full bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-3 focus:ring-2 focus:ring-amber-500 outline-none text-gray-800 dark:text-white transition-all shadow-inner" />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <input type="password" placeholder="Şifre" required className="w-full bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-3 focus:ring-2 focus:ring-amber-500 outline-none text-gray-800 dark:text-white transition-all shadow-inner" />
                            {authMode === 'login' && (
                                <div className="flex justify-end mt-1">
                                    <a href="#" className="text-xs text-amber-600 hover:underline">Şifremi unuttum</a>
                                </div>
                            )}
                        </div>
                        <button type="submit" className="mt-2 w-full py-3 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl transition-colors shadow-[0_4px_14px_0_rgba(217,119,6,0.39)]">
                            {authMode === 'login' ? 'Giriş Yap' : 'Kayıt Ol'}
                        </button>
                        <p className="text-sm text-center text-gray-500 dark:text-gray-400 mt-2">
                            {authMode === 'login' ? 'Hesabınız yok mu? ' : 'Zaten hesabınız var mı? '}
                            <button type="button" onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')} className="text-amber-600 dark:text-amber-500 font-bold hover:underline">
                                {authMode === 'login' ? 'Kayıt olun' : 'Giriş yapın'}
                            </button>
                        </p>
                    </form>
                </div>
            </div>

            {/* SETTINGS MODAL */}
            <div className={`fixed inset-0 bg-black/50 z-[4000] transition-opacity duration-300 flex items-center justify-center backdrop-blur-sm px-4 ${isSettingsOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
                <div className={`bg-white dark:bg-gray-800 w-full max-w-sm rounded-2xl shadow-2xl transform transition-transform duration-300 p-6 flex flex-col gap-6 border border-gray-100 dark:border-gray-700 ${isSettingsOpen ? 'scale-100' : 'scale-95'}`}>
                    <div className="flex justify-between items-center border-b border-gray-100 dark:border-gray-700 pb-3">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center"><Settings className="text-amber-600 mr-2" size={20} /> Ayarlar</h3>
                        <button onClick={() => setIsSettingsOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700">
                            <X size={20} />
                        </button>
                    </div>
                    
                    <div className="flex flex-col gap-5">
                        <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-700/50 p-4 rounded-xl">
                            <div className="flex items-center gap-3 text-gray-700 dark:text-gray-200 font-medium">
                                <Moon className="text-indigo-500" size={20} /> Karanlık Tema
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" checked={isDarkMode} onChange={handleThemeToggle} className="sr-only peer" />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-500 peer-checked:bg-amber-500"></div>
                            </label>
                        </div>

                        <div className="flex flex-col gap-3 bg-gray-50 dark:bg-gray-700/50 p-4 rounded-xl">
                            <label className="text-gray-700 dark:text-gray-200 font-medium flex items-center gap-3">
                                <Globe className="text-green-500" size={20} /> Dil / Language
                            </label>
                            <select className="bg-white border border-gray-200 text-gray-900 text-sm rounded-lg focus:ring-amber-500 focus:border-amber-500 block w-full p-2.5 dark:bg-gray-800 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white outline-none shadow-sm cursor-pointer">
                                <option value="tr">Türkçe</option>
                                <option value="en">English</option>
                                <option value="de">Deutsch</option>
                            </select>
                        </div>
                    </div>
                    <button onClick={() => setIsSettingsOpen(false)} className="mt-2 w-full py-3 bg-gray-900 dark:bg-white dark:text-gray-900 text-white font-bold rounded-xl transition-colors hover:bg-gray-800 dark:hover:bg-gray-100">
                        Kaydet ve Kapat
                    </button>
                </div>
            </div>

            {/* FULL MENU MODAL */}
            <div className={`fixed inset-0 w-full h-full bg-gray-50 dark:bg-gray-900 z-[4000] transform transition-transform duration-300 ease-in-out flex flex-col ${isFullMenuOpen ? 'translate-y-0' : 'translate-y-full'}`}>
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between bg-white dark:bg-gray-800 shadow-sm shrink-0">
                    <div className="flex flex-col">
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white truncate">{activePlace?.name} - Menü</h2>
                        <span className="text-xs text-gray-500 dark:text-gray-400">Tüm Ürünler ve Fiyatlar</span>
                    </div>
                    <button onClick={() => setIsFullMenuOpen(false)} className="w-10 h-10 flex items-center justify-center bg-gray-100 dark:bg-gray-700 rounded-full text-gray-600 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors shrink-0">
                        <X size={20} />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-20">
                    <div className="space-y-3">
                        {activePlace?.menu?.map((item, idx) => (
                            <div key={idx} className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700 flex justify-between items-center hover:border-amber-200 dark:hover:border-amber-700 hover:shadow-md transition-all">
                                <span className="text-gray-800 dark:text-gray-200 font-medium">{item.item}</span>
                                <div className="bg-gray-50 dark:bg-gray-700 px-3 py-1 rounded-lg border border-gray-100 dark:border-gray-600">
                                    <span className="text-amber-600 dark:text-amber-400 font-bold">{item.price}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

        </div>
    );
}