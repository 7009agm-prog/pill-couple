'use client';

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';

type Role = 'boyfriend' | 'girlfriend';

interface CheckIn {
  id: string;
  user_role: Role;
  date_str: string;
  slot: number;
  photo_url: string;
  note: string;
  created_at: string;
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('이미지를 불러올 수 없습니다.'));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error('파일을 읽을 수 없습니다.'));
    reader.readAsDataURL(file);
  });
}

async function compressImage(file: File, maxWidth = 1280, quality = 0.8): Promise<File> {
  let width = 0;
  let height = 0;
  let drawSource: CanvasImageSource;

  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file);
    width = bitmap.width;
    height = bitmap.height;
    drawSource = bitmap;
  } else {
    const img = await loadImageElement(file);
    width = img.naturalWidth || img.width;
    height = img.naturalHeight || img.height;
    drawSource = img;
  }

  const scale = Math.min(1, maxWidth / width);
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) return file;

  ctx.drawImage(drawSource, 0, 0, targetWidth, targetHeight);

  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', quality)
  );

  if (!blob) return file;

  const baseName = file.name.replace(/\.[^/.]+$/, '') || 'photo';
  return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
}

export default function Home() {
  const [todayStr, setTodayStr] = useState<string>('');
  const [myRole, setMyRole] = useState<Role | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [currentMonth, setCurrentMonth] = useState<string>('2026-11');
  const [isCalendarOpen, setIsCalendarOpen] = useState<boolean>(false);
  const [monthCheckIns, setMonthCheckIns] = useState<CheckIn[]>([]);
  const [note, setNote] = useState('');
  const [uploadingSlot, setUploadingSlot] = useState<number | null>(null);
  const [pushStatus, setPushStatus] = useState<string>('알림 미설정');

  const activeRole: Role = myRole ?? 'boyfriend';
  const partnerRole: Role = activeRole === 'boyfriend' ? 'girlfriend' : 'boyfriend';
  const roleLabel = (r: Role) => (r === 'boyfriend' ? '남자친구' : '여자친구');

  const fetchMonthCheckIns = async (ym: string) => {
    const { data } = await supabase
      .from('check_ins')
      .select('*')
      .like('date_str', ym + '-%')
      .order('created_at', { ascending: true });
    if (data) setMonthCheckIns(data);
  };

  useEffect(() => {
    const kstToday = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
    setTodayStr(kstToday);
    setSelectedDate(kstToday);
    setCurrentMonth(kstToday.slice(0, 7));

    const saved = localStorage.getItem('myRole') as Role | null;
    if (saved === 'boyfriend' || saved === 'girlfriend') {
      setMyRole(saved);
    }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js');
    }
  }, []);

  useEffect(() => {
    if (currentMonth) {
      fetchMonthCheckIns(currentMonth);
    }
  }, [currentMonth]);

  const handleRegisterRole = (role: Role) => {
    setMyRole(role);
    localStorage.setItem('myRole', role);
  };

  const handleResetRole = () => {
    setMyRole(null);
    localStorage.removeItem('myRole');
  };

  const changeMonth = (diff: number) => {
    const [y, m] = currentMonth.split('-').map(Number);
    const next = new Date(y, m - 1 + diff, 1);
    const nextYm = next.getFullYear() + '-' + String(next.getMonth() + 1).padStart(2, '0');
    setCurrentMonth(nextYm);
    setSelectedDate(todayStr && nextYm === todayStr.slice(0, 7) ? todayStr : nextYm + '-01');
  };

  const calendarDays = useMemo(() => {
    const [y, m] = currentMonth.split('-').map(Number);
    const firstDayOfWeek = new Date(y, m - 1, 1).getDay();
    const daysInMonth = new Date(y, m, 0).getDate();
    const cells: (string | null)[] = [];
    for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(currentMonth + '-' + String(d).padStart(2, '0'));
    }
    return cells;
  }, [currentMonth]);

  const monthlyStats = useMemo(() => {
    const [y, m] = currentMonth.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const targetCount = daysInMonth * 2;
    const myCount = monthCheckIns.filter((c) => c.user_role === activeRole).length;
    const partnerCount = monthCheckIns.filter((c) => c.user_role === partnerRole).length;
    return {
      targetCount,
      myCount,
      partnerCount,
      myRate: targetCount > 0 ? Math.min(100, Math.round((myCount / targetCount) * 100)) : 0,
      partnerRate: targetCount > 0 ? Math.min(100, Math.round((partnerCount / targetCount) * 100)) : 0,
    };
  }, [monthCheckIns, currentMonth, activeRole, partnerRole]);

  const enablePushNotification = async () => {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        alert('아이폰에서는 Safari에서 [공유 -> 홈 화면에 추가]로 연 뒤 눌러주세요!');
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        alert('알림 권한이 거부되었습니다.');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
      });
      await supabase.from('push_subscriptions').upsert({
        user_role: activeRole,
        subscription: sub.toJSON(),
        updated_at: new Date().toISOString(),
      });
      setPushStatus('알림 켜짐 ✅');
      alert(roleLabel(activeRole) + ' 아이폰으로 알림이 연결되었습니다!');
    } catch (e) {
      console.error(e);
      alert('알림 등록 중 오류가 발생했습니다. 홈 화면에 추가된 앱인지 확인해주세요.');
    }
  };

  const handleUpload = async (slot: number, file?: File) => {
    if (!file || !myRole || !selectedDate) return;
    setUploadingSlot(slot);
    try {
      const processedFile = await compressImage(file, 1280, 0.8);
      const ext = processedFile.name.split('.').pop()?.toLowerCase() || 'jpg';
      const filePath = selectedDate + '/' + myRole + '_slot' + slot + '_' + Date.now() + '.' + ext;

      const { error: uploadError } = await supabase.storage
        .from('pill-photos')
        .upload(filePath, processedFile, {
          contentType: processedFile.type || 'image/jpeg',
          upsert: true,
        });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('pill-photos').getPublicUrl(filePath);
      const { error: dbError } = await supabase.from('check_ins').upsert(
        {
          user_role: myRole,
          date_str: selectedDate,
          slot,
          photo_url: urlData.publicUrl,
          note: note || '약 복용 완료! 💊',
        },
        { onConflict: 'user_role,date_str,slot' }
      );
      if (dbError) throw dbError;

      setNote('');
      await fetchMonthCheckIns(currentMonth);
    } catch (e: unknown) {
      console.error(e);
      const message =
        e && typeof e === 'object' && 'message' in e
          ? String((e as { message?: unknown }).message)
          : String(e);
      alert('사진 업로드에 실패했습니다: ' + message);
    } finally {
      setUploadingSlot(null);
    }
  };

  const handlePoke = async (slot: number) => {
    if (!myRole) return;
    const res = await fetch('/api/poke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetRole: partnerRole, senderName: roleLabel(myRole), slot }),
    });
    const result = await res.json();
    if (res.ok) {
      alert(roleLabel(partnerRole) + '에게 콕 찌르기 알림을 보냈어요! 👉');
    } else {
      alert(result.error || '알림 전송 실패');
    }
  };

  const getRecord = (date: string, role: Role, slot: number) =>
    monthCheckIns.find((c) => c.date_str === date && c.user_role === role && c.slot === slot);

  if (!myRole) {
    return (
      <main className="max-w-md mx-auto p-6 min-h-screen flex items-center justify-center">
        <section className="w-full bg-white rounded-3xl p-6 shadow-sm space-y-5 text-center">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-rose-500">처음 한 번만 등록</p>
            <h1 className="text-xl font-bold text-gray-900">💊 나는 누구인가요?</h1>
            <p className="text-xs text-gray-500">
              선택한 역할이 이 기기에 저장되며, 내 화면에서만 약 인증을 등록할 수 있어요.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handleRegisterRole('boyfriend')}
              className="py-4 rounded-2xl border-2 border-rose-200 bg-rose-50 hover:bg-rose-500 hover:text-white hover:border-rose-500 font-bold text-sm text-rose-700 transition"
            >
              🙋‍♂️ 남자친구로 등록
            </button>
            <button
              onClick={() => handleRegisterRole('girlfriend')}
              className="py-4 rounded-2xl border-2 border-rose-200 bg-rose-50 hover:bg-rose-500 hover:text-white hover:border-rose-500 font-bold text-sm text-rose-700 transition"
            >
              🙋‍♀️ 여자친구로 등록
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="max-w-md mx-auto p-4 space-y-4 pb-10">
      <header className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400">
              {selectedDate === todayStr ? '오늘: ' + todayStr : '선택일: ' + selectedDate}
            </p>
            <h1 className="text-lg font-bold text-rose-600">💊 우리 둘의 약 체크</h1>
          </div>
          <button
            onClick={() => setIsCalendarOpen(true)}
            className="bg-rose-50 text-rose-600 border border-rose-200 px-3 py-2 rounded-xl text-xs font-bold hover:bg-rose-100 transition"
          >
            📅 캘린더 보기
          </button>
        </div>

        <div className="flex items-center justify-between bg-rose-50/70 border border-rose-100 px-3 py-2 rounded-xl text-xs">
          <span className="font-semibold text-gray-800">
            등록된 내 역할: <strong className="text-rose-600">{roleLabel(myRole)}</strong>
          </span>
          <button
            onClick={handleResetRole}
            className="text-gray-500 hover:text-gray-800 underline font-medium"
          >
            역할 다시 선택
          </button>
        </div>
      </header>

      <div className="bg-white rounded-2xl p-3.5 shadow-sm flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">내 아이폰 푸시 ({roleLabel(myRole)})</p>
          <p className="text-xs text-gray-500">상태: {pushStatus}</p>
        </div>
        <button
          onClick={enablePushNotification}
          className="bg-gray-900 text-white text-xs px-3 py-2 rounded-xl font-medium"
        >
          알림 허용하기
        </button>
      </div>

      {todayStr && selectedDate && selectedDate !== todayStr && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-2.5 flex items-center justify-between">
          <span className="text-xs font-semibold text-amber-900">
            📌 {selectedDate} 기록 조회 중
          </span>
          <button
            onClick={() => {
              setCurrentMonth(todayStr.slice(0, 7));
              setSelectedDate(todayStr);
            }}
            className="text-xs font-bold text-rose-600 underline"
          >
            오늘로 돌아가기
          </button>
        </div>
      )}

      {[1, 2].map((slot) => {
        const myRec = getRecord(selectedDate, myRole, slot);
        const partnerRec = getRecord(selectedDate, partnerRole, slot);

        return (
          <section key={slot} className="bg-white rounded-2xl p-4 shadow-sm space-y-4">
            <h2 className="font-bold text-base border-b pb-2">
              {slot === 1 ? '☀️ 1회차 (오전/점심)' : '🌙 2회차 (저녁/취침 전)'}
            </h2>

            <div className="space-y-2">
              <p className="text-sm font-semibold text-rose-600">
                나 · {roleLabel(myRole)} {myRec ? '✅ 완료' : '⏳ 미완료'}
              </p>

              {myRec ? (
                <div className="space-y-1">
                  <img
                    src={myRec.photo_url}
                    alt="내 인증샷"
                    className="w-full h-48 object-cover rounded-xl"
                  />
                  <p className="text-sm text-gray-700 bg-rose-50 p-2 rounded-lg">
                    💬 {myRec.note}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder={roleLabel(myRole) + ' 한마디 (예: 밥 먹고 바로 먹었어!)'}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="w-full border rounded-xl px-3 py-2 text-sm"
                  />
                  <label className="block w-full text-center bg-rose-500 text-white py-2.5 rounded-xl text-sm font-semibold cursor-pointer">
                    {uploadingSlot === slot ? '업로드 중...' : '📸 내 약 인증샷 찍기 / 올리기'}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => handleUpload(slot, e.target.files?.[0])}
                    />
                  </label>
                </div>
              )}
            </div>

            <div className="pt-3 border-t space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-700">
                  상대방 · {roleLabel(partnerRole)} {partnerRec ? '✅ 완료' : '⏳ 아직 안 먹음'}
                </p>
                {!partnerRec && selectedDate === todayStr && (
                  <button
                    onClick={() => handlePoke(slot)}
                    className="bg-amber-400 hover:bg-amber-500 text-gray-900 text-xs font-bold px-3 py-1.5 rounded-xl"
                  >
                    👉 콕 찌르기
                  </button>
                )}
              </div>

              {partnerRec ? (
                <div className="space-y-1">
                  <img
                    src={partnerRec.photo_url}
                    alt="상대방 인증샷"
                    className="w-full h-48 object-cover rounded-xl"
                  />
                  <p className="text-sm text-gray-700 bg-gray-100 p-2 rounded-lg">
                    💬 {partnerRec.note}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-gray-400 bg-gray-50 rounded-xl p-3 text-center">
                  {roleLabel(partnerRole)} 기기에서만 등록할 수 있어요.
                </p>
              )}
            </div>
          </section>
        );
      })}

      {isCalendarOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-5 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <h2 className="font-bold text-base">📅 월간 복용 캘린더</h2>
              <button
                onClick={() => setIsCalendarOpen(false)}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold px-3 py-1.5 rounded-xl"
              >
                닫기 ✕
              </button>
            </div>

            <div className="flex items-center justify-between">
              <button
                onClick={() => changeMonth(-1)}
                className="px-3 py-1 rounded-lg bg-gray-100 text-sm font-bold"
              >
                ◀
              </button>
              <span className="font-bold text-sm">
                {currentMonth.replace('-', '년 ')}월
              </span>
              <button
                onClick={() => changeMonth(1)}
                className="px-3 py-1 rounded-lg bg-gray-100 text-sm font-bold"
              >
                ▶
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="bg-rose-50 rounded-xl p-2.5">
                <p className="text-xs text-rose-600 font-semibold">나 ({roleLabel(myRole)})</p>
                <p className="text-lg font-bold text-gray-900">
                  {monthlyStats.myCount}{' '}
                  <span className="text-xs font-normal text-gray-500">
                    / {monthlyStats.targetCount}회 ({monthlyStats.myRate}%)
                  </span>
                </p>
              </div>
              <div className="bg-amber-50 rounded-xl p-2.5">
                <p className="text-xs text-amber-700 font-semibold">
                  상대 ({roleLabel(partnerRole)})
                </p>
                <p className="text-lg font-bold text-gray-900">
                  {monthlyStats.partnerCount}{' '}
                  <span className="text-xs font-normal text-gray-500">
                    / {monthlyStats.targetCount}회 ({monthlyStats.partnerRate}%)
                  </span>
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 text-[11px] text-gray-500">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" /> 나 (1·2회)
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> 상대 (1·2회)
              </span>
            </div>

            <div className="grid grid-cols-7 text-center text-xs font-semibold text-gray-400">
              {['일', '월', '화', '수', '목', '금', '토'].map((d) => (
                <div key={d} className="py-1">
                  {d}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((dateStr, idx) => {
                if (!dateStr) return <div key={'empty-' + idx} className="h-14" />;
                const dayNum = Number(dateStr.slice(8, 10));
                const myDayCount = monthCheckIns.filter(
                  (c) => c.date_str === dateStr && c.user_role === myRole
                ).length;
                const partnerDayCount = monthCheckIns.filter(
                  (c) => c.date_str === dateStr && c.user_role === partnerRole
                ).length;
                const isSelected = dateStr === selectedDate;
                const isToday = dateStr === todayStr;

                return (
                  <button
                    key={dateStr}
                    onClick={() => {
                      setSelectedDate(dateStr);
                      setIsCalendarOpen(false);
                    }}
                    className={
                      'h-14 rounded-xl flex flex-col items-center justify-between py-1.5 border transition ' +
                      (isSelected
                        ? 'border-rose-500 bg-rose-50/70'
                        : 'border-transparent hover:bg-gray-50')
                    }
                  >
                    <span
                      className={
                        'text-xs font-semibold w-5 h-5 flex items-center justify-center rounded-full ' +
                        (isToday ? 'bg-gray-900 text-white' : 'text-gray-700')
                      }
                    >
                      {dayNum}
                    </span>
                    <div className="space-y-0.5">
                      <div className="flex gap-0.5 justify-center">
                        {[1, 2].map((s) => (
                          <span
                            key={'m-' + s}
                            className={
                              'w-1.5 h-1.5 rounded-full ' +
                              (myDayCount >= s ? 'bg-rose-500' : 'bg-gray-200')
                            }
                          />
                        ))}
                      </div>
                      <div className="flex gap-0.5 justify-center">
                        {[1, 2].map((s) => (
                          <span
                            key={'p-' + s}
                            className={
                              'w-1.5 h-1.5 rounded-full ' +
                              (partnerDayCount >= s ? 'bg-amber-400' : 'bg-gray-200')
                            }
                          />
                        ))}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
