'use client';

import React, { forwardRef } from 'react';
import ReactDOM from 'react-dom';

import { CloseIcon, getAsset, Loader } from './assets';
import { useIsDocumentHidden } from './hooks';
import { toast, ToastState } from './state';
import './styles.css';
import {
  isAction,
  type ExternalToast,
  type HeightT,
  type ToasterProps,
  type ToastProps,
  type ToastT,
  type ToastToDismiss,
} from './types';

// Visible toasts amount
const VISIBLE_TOASTS_AMOUNT = 3;

// Viewport padding
const VIEWPORT_OFFSET = '32px';

// Default lifetime of a toasts (in ms)
const TOAST_LIFETIME = 4000;

// Default toast width
const TOAST_WIDTH = 356;

// Default gap between toasts
const GAP = 14;

// Threshold to dismiss a toast
const SWIPE_THRESHOLD = 20;

// Equal to exit animation duration
const TIME_BEFORE_UNMOUNT = 200;

function _cn(...classes: (string | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// 이 컴포넌트가 Toast한장한장 나타내는 list item이다.
const Toast = (props: ToastProps) => {
  const {
    invert: ToasterInvert,
    toast,
    unstyled,
    interacting,
    setHeights,
    visibleToasts,
    heights,
    index,
    toasts,
    expanded,
    removeToast,
    defaultRichColors,
    closeButton: closeButtonFromToaster,
    style,
    cancelButtonStyle,
    actionButtonStyle,
    className = '',
    descriptionClassName = '',
    duration: durationFromToaster,
    position,
    gap,
    loadingIcon: loadingIconProp,
    expandByDefault,
    classNames,
    icons,
    closeButtonAriaLabel = 'Close toast',
    pauseWhenPageIsHidden,
    cn,
  } = props;
  const [mounted, setMounted] = React.useState(false);
  const [removed, setRemoved] = React.useState(false);
  const [swiping, setSwiping] = React.useState(false);
  const [swipeOut, setSwipeOut] = React.useState(false);
  const [isSwiped, setIsSwiped] = React.useState(false);
  const [offsetBeforeRemove, setOffsetBeforeRemove] = React.useState(0);
  const [initialHeight, setInitialHeight] = React.useState(0);
  const remainingTime = React.useRef(toast.duration || durationFromToaster || TOAST_LIFETIME);
  const dragStartTime = React.useRef<Date | null>(null);
  const toastRef = React.useRef<HTMLLIElement>(null);
  const isFront = index === 0;
  const isVisible = index + 1 <= visibleToasts;
  const toastType = toast.type;
  const dismissible = toast.dismissible !== false;
  const toastClassname = toast.className || '';
  const toastDescriptionClassname = toast.descriptionClassName || '';
  // Height index is used to calculate the offset as it gets updated before the toast array, which means we can calculate the new layout faster.
  const heightIndex = React.useMemo(
    () => heights.findIndex((height) => height.toastId === toast.id) || 0,
    [heights, toast.id],
  );
  const closeButton = React.useMemo(
    () => toast.closeButton ?? closeButtonFromToaster,
    [toast.closeButton, closeButtonFromToaster],
  );

  const offset = React.useRef(0);
  const closeTimerStartTimeRef = React.useRef(0);
  const lastCloseTimerStartTimeRef = React.useRef(0);
  const pointerStartRef = React.useRef<{ x: number; y: number } | null>(null);
  const [y, x] = position.split('-');
  const toastsHeightBefore = React.useMemo(() => {
    return heights.reduce((prev, curr, reducerIndex) => {
      // Calculate offset up until current  toast
      if (reducerIndex >= heightIndex) {
        return prev;
      }

      return prev + curr.height;
    }, 0);
  }, [heights, heightIndex]);
  const isDocumentHidden = useIsDocumentHidden();

  const invert = toast.invert || ToasterInvert;
  const disabled = toastType === 'loading';

  offset.current = React.useMemo(() => heightIndex * gap + toastsHeightBefore, [heightIndex, toastsHeightBefore]);

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  React.useEffect(() => {
    // 마운트되면 mounted상태를 true 로 변경. mounted가 false이면 useLayoutEffect 동작 안함.
    // Trigger enter animation without using CSS animation
    // data-mounted가 true가 되면 css 애니메이션 동작하는 듯?
    setMounted(true);
  }, []);

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // 이 부수효과의 쓰임이 뭘까?
  React.useEffect(() => {
    const toastNode = toastRef.current;
    if (toastNode) {
      const height = toastNode.getBoundingClientRect().height;
      // toast가 마운트 된 후 li 의 높이를 initialHeight로 업데이트 한다.
      // Add toast height to heights array after the toast is mounted
      setInitialHeight(height);
      // 상위컴포넌트에서 관리하는 상태인, heights배열에 해당 toast의 높이 데이터를 추가한다.
      setHeights((h) => [{ toastId: toast.id, height, position: toast.position }, ...h]);
      // 현재 toast가 화면에서 unmount 될 때는 heights상태에서 해당 내용을 제거한다.
      return () => setHeights((h) => h.filter((height) => height.toastId !== toast.id));
    }
  }, [setHeights, toast.id]);

  React.useLayoutEffect(() => {
    // 마운트 안됐으면 하지도 마
    if (!mounted) return;
    const toastNode = toastRef.current;
    const originalHeight = toastNode.style.height;
    toastNode.style.height = 'auto';
    const newHeight = toastNode.getBoundingClientRect().height;
    toastNode.style.height = originalHeight;

    setInitialHeight(newHeight);

    setHeights((heights) => {
      const alreadyExists = heights.find((height) => height.toastId === toast.id);
      if (!alreadyExists) {
        return [{ toastId: toast.id, height: newHeight, position: toast.position }, ...heights];
      } else {
        return heights.map((height) => (height.toastId === toast.id ? { ...height, height: newHeight } : height));
      }
    });
  }, [mounted, toast.title, toast.description, setHeights, toast.id]);

  // ol컴포넌트에서 props로 받은 removeToast함수를 호출한다.
  const deleteToast = React.useCallback(() => {
    // Save the offset for the exit swipe animation
    // 이것들은 뭐지?
    setRemoved(true);
    setOffsetBeforeRemove(offset.current);
    setHeights((h) => h.filter((height) => height.toastId !== toast.id));

    setTimeout(() => {
      removeToast(toast);
    }, TIME_BEFORE_UNMOUNT);
  }, [toast, removeToast, setHeights, offset]);

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  React.useEffect(() => {
    // promise, loading 이거나  duration이 무한하면 동작 안함.
    if ((toast.promise && toastType === 'loading') || toast.duration === Infinity || toast.type === 'loading') return;
    let timeoutId: NodeJS.Timeout;

    // 타이머 정지
    const pauseTimer = () => {
      // if 마지막 타이머 시작 시간 < 현재 타이머 시작 시간 =>대부분 이경우 아님?
      if (lastCloseTimerStartTimeRef.current < closeTimerStartTimeRef.current) {
        // Get the elapsed time since the timer started => 타이머 시작부터 정지되기까지의 경과시간 = 함수호출된 시점 - 타이머 시작시간
        const elapsedTime = new Date().getTime() - closeTimerStartTimeRef.current;
        // 남은 시간 = 이전 남은시간 - 타이머 시작부터 정지되기까지의 경과시간
        remainingTime.current = remainingTime.current - elapsedTime;
        // 나중에 다시 시작하면 remainingTime이 적어져서 타이머 금방 끝나게 됨.
      }
      // 마지막의 타이머 시작시간 현재시간으로 업데이트
      lastCloseTimerStartTimeRef.current = new Date().getTime();
    };

    // startTimer가 호출되면 remainingTime이 흐른 뒤에 toast가 닫힘.
    const startTimer = () => {
      // setTimeout(, Infinity) behaves as if the delay is 0.
      // As a result, the toast would be closed immediately, giving the appearance that it was never rendered.
      // See: https://github.com/denysdovhan/wtfjs?tab=readme-ov-file#an-infinite-timeout
      // setTimeout(, Infinity)는 setTimeout(, 0)처럼 동작해서 toast가 바로 닫힐 수 있으니 Infinity인 경우는 얼리리턴
      if (remainingTime.current === Infinity) return;

      // 타이머 시작시간을 지금시간으로 업데이트 => 타이머 정지할때 남은시간 계산하려면 필요함.
      closeTimerStartTimeRef.current = new Date().getTime();

      // Let the toast know it has started
      timeoutId = setTimeout(() => {
        toast.onAutoClose?.(toast);
        deleteToast();
      }, remainingTime.current);
    };

    // 열리거나, 상호작용 중이거나, (pauseWhenPageIsHidden && isDocumentHidden) 인 경우 타이머 정지,
    if (expanded || interacting || (pauseWhenPageIsHidden && isDocumentHidden)) {
      pauseTimer();
    } else {
      // 열리지도 않고, 상호작용중도 아니고, (pauseWhenPageIsHidden && isDocumentHidden)인 케이스도 아니면 타이머 재생
      startTimer();
    }

    return () => clearTimeout(timeoutId);
  }, [expanded, interacting, toast, toastType, pauseWhenPageIsHidden, isDocumentHidden, deleteToast]);

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  React.useEffect(() => {
    // 만약 랜더링 하는 toast(list item)의 delete속성이 true면 deleteToast함수 호출 , toast객체의 delete상태가 true면 지운다.
    if (toast.delete) {
      deleteToast();
    }
  }, [deleteToast, toast.delete]);

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // 로딩아이콘 가져오는 함수
  function getLoadingIcon() {
    // icons는 처음 사용자가 <Toaster icons={{success:ReactNode, loading:ReactNode}}/> 이렇게 호출해야됨.
    // 사용자가 설정한 경우, 그 아이콘을 리턴함.
    if (icons?.loading) {
      return (
        <div
          className={cn(classNames?.loader, toast?.classNames?.loader, 'sonner-loader')}
          data-visible={toastType === 'loading'}
        >
          {icons.loading}
        </div>
      );
    }
    // 낮은 우선순위로 <Toaster loadingIcon={ReactNode}/> 로 넘겨준게 있으면 그것을 리턴함.
    if (loadingIconProp) {
      return (
        <div
          className={cn(classNames?.loader, toast?.classNames?.loader, 'sonner-loader')}
          data-visible={toastType === 'loading'}
        >
          {loadingIconProp}
        </div>
      );
    }
    // 위 두 케이스에 해당되지 않는다면 기본 Loader 랜더링.
    return <Loader className={cn(classNames?.loader, toast?.classNames?.loader)} visible={toastType === 'loading'} />;
  }
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

  return (
    <li
      tabIndex={0}
      ref={toastRef}
      className={cn(
        className,
        toastClassname,
        classNames?.toast,
        toast?.classNames?.toast,
        classNames?.default,
        classNames?.[toastType],
        toast?.classNames?.[toastType],
      )}
      data-sonner-toast=""
      data-rich-colors={toast.richColors ?? defaultRichColors}
      data-styled={!Boolean(toast.jsx || toast.unstyled || unstyled)}
      data-mounted={mounted}
      data-promise={Boolean(toast.promise)}
      data-swiped={isSwiped}
      data-removed={removed}
      data-visible={isVisible}
      data-y-position={y}
      data-x-position={x}
      data-index={index}
      data-front={isFront}
      data-swiping={swiping}
      data-dismissible={dismissible}
      data-type={toastType}
      data-invert={invert}
      data-swipe-out={swipeOut}
      data-expanded={Boolean(expanded || (expandByDefault && mounted))}
      style={
        {
          '--index': index,
          '--toasts-before': index,
          '--z-index': toasts.length - index,
          '--offset': `${removed ? offsetBeforeRemove : offset.current}px`,
          '--initial-height': expandByDefault ? 'auto' : `${initialHeight}px`,
          ...style,
          ...toast.style,
        } as React.CSSProperties
      }
      onPointerDown={(event) => {
        if (disabled || !dismissible) return;
        dragStartTime.current = new Date();
        setOffsetBeforeRemove(offset.current);
        // Ensure we maintain correct pointer capture even when going outside of the toast (e.g. when swiping)
        (event.target as HTMLElement).setPointerCapture(event.pointerId);
        if ((event.target as HTMLElement).tagName === 'BUTTON') return;
        setSwiping(true);
        pointerStartRef.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerUp={() => {
        if (swipeOut || !dismissible) return;

        pointerStartRef.current = null;
        const swipeAmount = Number(toastRef.current?.style.getPropertyValue('--swipe-amount').replace('px', '') || 0);
        const timeTaken = new Date().getTime() - dragStartTime.current?.getTime();
        const velocity = Math.abs(swipeAmount) / timeTaken;

        // Remove only if threshold is met
        if (Math.abs(swipeAmount) >= SWIPE_THRESHOLD || velocity > 0.11) {
          setOffsetBeforeRemove(offset.current);
          toast.onDismiss?.(toast);
          deleteToast();
          setSwipeOut(true);
          setIsSwiped(false);
          return;
        }

        toastRef.current?.style.setProperty('--swipe-amount', '0px');
        setSwiping(false);
      }}
      onPointerMove={(event) => {
        if (!pointerStartRef.current || !dismissible) return;

        const yPosition = event.clientY - pointerStartRef.current.y;
        const isHighlighted = window.getSelection()?.toString().length > 0;
        const swipeAmount = Number(toastRef.current?.style.getPropertyValue('--swipe-amount').replace('px', '') || 0);

        if (swipeAmount > 0) {
          setIsSwiped(true);
        }

        if (isHighlighted) return;

        toastRef.current?.style.setProperty('--swipe-amount', `${Math.max(0, yPosition)}px`);
      }}
    >
      {closeButton && !toast.jsx ? (
        <button
          aria-label={closeButtonAriaLabel}
          data-disabled={disabled}
          data-close-button
          onClick={
            disabled || !dismissible
              ? () => {}
              : () => {
                  deleteToast();
                  toast.onDismiss?.(toast);
                }
          }
          className={cn(classNames?.closeButton, toast?.classNames?.closeButton)}
        >
          {icons?.close ?? CloseIcon}
        </button>
      ) : null}
      {/* TODO: This can be cleaner */}
      {toast.jsx || React.isValidElement(toast.title) ? (
        toast.jsx ? (
          toast.jsx
        ) : typeof toast.title === 'function' ? (
          toast.title()
        ) : (
          toast.title
        )
      ) : (
        <>
          {toastType || toast.icon || toast.promise ? (
            <div data-icon="" className={cn(classNames?.icon, toast?.classNames?.icon)}>
              {toast.promise || (toast.type === 'loading' && !toast.icon) ? toast.icon || getLoadingIcon() : null}
              {toast.type !== 'loading' ? toast.icon || icons?.[toastType] || getAsset(toastType) : null}
            </div>
          ) : null}

          <div data-content="" className={cn(classNames?.content, toast?.classNames?.content)}>
            <div data-title="" className={cn(classNames?.title, toast?.classNames?.title)}>
              {typeof toast.title === 'function' ? toast.title() : toast.title}
            </div>
            {toast.description ? (
              <div
                data-description=""
                className={cn(
                  descriptionClassName,
                  toastDescriptionClassname,
                  classNames?.description,
                  toast?.classNames?.description,
                )}
              >
                {typeof toast.description === 'function' ? toast.description() : toast.description}
              </div>
            ) : null}
          </div>
          {React.isValidElement(toast.cancel) ? (
            toast.cancel
          ) : toast.cancel && isAction(toast.cancel) ? (
            <button
              data-button
              data-cancel
              style={toast.cancelButtonStyle || cancelButtonStyle}
              onClick={(event) => {
                // We need to check twice because typescript
                if (!isAction(toast.cancel)) return;
                if (!dismissible) return;
                toast.cancel.onClick?.(event);
                deleteToast();
              }}
              className={cn(classNames?.cancelButton, toast?.classNames?.cancelButton)}
            >
              {toast.cancel.label}
            </button>
          ) : null}
          {React.isValidElement(toast.action) ? (
            toast.action
          ) : toast.action && isAction(toast.action) ? (
            <button
              data-button
              data-action
              style={toast.actionButtonStyle || actionButtonStyle}
              onClick={(event) => {
                // We need to check twice because typescript
                if (!isAction(toast.action)) return;
                toast.action.onClick?.(event);
                if (event.defaultPrevented) return;
                deleteToast();
              }}
              className={cn(classNames?.actionButton, toast?.classNames?.actionButton)}
            >
              {toast.action.label}
            </button>
          ) : null}
        </>
      )}
    </li>
  );
};

function getDocumentDirection(): ToasterProps['dir'] {
  if (typeof window === 'undefined') return 'ltr';
  if (typeof document === 'undefined') return 'ltr'; // For Fresh purpose

  const dirAttribute = document.documentElement.getAttribute('dir');

  if (dirAttribute === 'auto' || !dirAttribute) {
    return window.getComputedStyle(document.documentElement).direction as ToasterProps['dir'];
  }

  return dirAttribute as ToasterProps['dir'];
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// 이상한 점: useSonner를 앱에서 여러번 호출하면 동일한 subscriber가 여러번 구독됨.
function useSonner() {
  // 여러번 호출되면 서로 다른 activeToasts 지역상태가 여러번 생기는거 아닌가?
  // 싱글톤 객체인 ToastState가 동일한 보조함수를 여러번 구독하게됨. forEach로 실행시키기 때문에 다른 상태를 보는일을 없을것같긴 하지만
  // useSonner를 여러번 호출하면 각자 동일한 데이터의 지역상태가 생기기 때문에 불필요한 메모리 낭비로 볼 수 있다.
  const [activeToasts, setActiveToasts] = React.useState<ToastT[]>([]);

  React.useEffect(() => {
    // ToastState는 싱글톤 패턴으로 만들어진 상태를 기록하는 Observer객체임.
    // useSonner를 사용하면 해당 객체에 subscribe메서드를 호출함.
    // addToast(toast)를 호출하면 최종적으로 subscriber가 toast를 매개변수로 호출됨.
    return ToastState.subscribe((toast) => {
      setActiveToasts((currentToasts) => {
        // 전달된 toast매개변수가 dismiss:true이면 activeToast에서 제거한다.
        if ('dismiss' in toast && toast.dismiss) {
          return currentToasts.filter((t) => t.id !== toast.id);
        }

        // dismiss가 아니라면 이미 존재하는 toast id인지 찾는다.
        const existingToastIndex = currentToasts.findIndex((t) => t.id === toast.id);
        // 만약 매개변수로 전달받은 toast 객체의 id가 이미 있었다면
        if (existingToastIndex !== -1) {
          const updatedToasts = [...currentToasts];
          // 기존 속성을 최대한 유지하고, 새로 받은 속성으로 업데이트 한다.
          updatedToasts[existingToastIndex] = { ...updatedToasts[existingToastIndex], ...toast };
          return updatedToasts;
        } else {
          // 모든 케이스에 해당되지 않고 순수하게 추가된 toast라면 배열 맨 앞에 추가한다.
          return [toast, ...currentToasts];
        }
      });
    });
  }, []);

  // 결과적으로 이 훅을 호출하면 현재 ToastState의 현재 상태를 동일하게 가지고있는 activeToast배열을 사용하게 된다.
  return {
    toasts: activeToasts,
  };
}

const Toaster = forwardRef<HTMLElement, ToasterProps>(function Toaster(props, ref) {
  const {
    invert,
    position = 'bottom-right',
    hotkey = ['altKey', 'KeyT'],
    expand,
    closeButton,
    className,
    offset,
    theme = 'light',
    richColors,
    duration,
    style,
    visibleToasts = VISIBLE_TOASTS_AMOUNT,
    toastOptions,
    dir = getDocumentDirection(),
    gap = GAP,
    loadingIcon,
    icons,
    containerAriaLabel = 'Notifications',
    pauseWhenPageIsHidden,
    cn = _cn,
  } = props;
  // toasts가 핵심.
  const [toasts, setToasts] = React.useState<ToastT[]>([]);
  // possiblePositions는 ['bottom-right'] | ['bottom-left'] | ... 이런 식
  const possiblePositions = React.useMemo(() => {
    return Array.from(
      new Set([position].concat(toasts.filter((toast) => toast.position).map((toast) => toast.position))),
    );
  }, [toasts, position]);

  // heights는 각 toast들의 id, height(실제높이), position(대부분 undefined) 구조체 배열
  const [heights, setHeights] = React.useState<HeightT[]>([]);
  // expanded가 true가 되면 toasts들이 펼쳐짐
  const [expanded, setExpanded] = React.useState(false);
  // interacting은 유저가 토스트를 만질때 true가 됨.
  const [interacting, setInteracting] = React.useState(false);

  // 테마
  const [actualTheme, setActualTheme] = React.useState(
    theme !== 'system'
      ? theme
      : typeof window !== 'undefined'
      ? window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : 'light',
  );

  const listRef = React.useRef<HTMLOListElement>(null); // ol 태그 참조임.
  const hotkeyLabel = hotkey.join('+').replace(/Key/g, '').replace(/Digit/g, ''); // 'alt+T' 이런식으로 파싱됨.
  const lastFocusedElementRef = React.useRef<HTMLElement>(null); // 키보드 접근성 향상
  const isFocusWithinRef = React.useRef(false); // 키보드 접근성 향상

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // 나중에 li로 전달되어서 closeButton의 클릭 event handler에서 호출됨.
  const removeToast = React.useCallback((toastToRemove: ToastT) => {
    setToasts((toasts) => {
      // 기존에 있는 toasts 목록에서 매개변수로 받은 toast와 id가 같은것을 찾은 뒤, delete가 false인 경우..
      if (!toasts.find((toast) => toast.id === toastToRemove.id)?.delete) {
        // dismiss method: 모든 subscribers 함수에게 {id, dismiss:true}를 인자로 호출시킴.(위 경우는 싱글톤 객체 업데이트)
        ToastState.dismiss(toastToRemove.id);
      }

      // 아니면 그냥 기존 toasts에서 id 일치하는거 제외시킴(지역상태만 업데이트? - 싱글톤 객체 업데이트와 무슨차이지?)
      return toasts.filter(({ id }) => id !== toastToRemove.id);
    });
  }, []);

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  React.useEffect(() => {
    // 첫 마운트 시에 한번 subscribe 시킴. subscribe에 인자로 들어간 함수가 subscriber 로 등록됨.
    return ToastState.subscribe((toast) => {
      // 이제부터 이 함수가 subscriber가 되어 앱 전체적으로 호출될 것임.
      if ((toast as ToastToDismiss).dismiss) {
        // 만약 매개변수로 받은 toast가 dismiss:true이면
        // 기존 toasts에서 id가 같은 toast를 찾아서 delete속성을 true로 만든다. 나머지는 그대로 유지.
        setToasts((toasts) => toasts.map((t) => (t.id === toast.id ? { ...t, delete: true } : t)));
        return;
      }
      // dismiss:true가 아닌 subscriber 호출이라면...
      // batch update를 방지하기 위해 테스크큐에 작업을 하나 만들고, dom에 강제 업데이트.
      // Prevent batching, temp solution.
      setTimeout(() => {
        ReactDOM.flushSync(() => {
          setToasts((toasts) => {
            const indexOfExistingToast = toasts.findIndex((t) => t.id === toast.id);

            // Update the toast if it already exists
            // 만약 매개변수로 받은 toast가 이미 화면에 존재한다면...
            if (indexOfExistingToast !== -1) {
              // 정확히 그 toast를 찾아서 변경사항을 업데이트 한다.
              return [
                ...toasts.slice(0, indexOfExistingToast),
                { ...toasts[indexOfExistingToast], ...toast },
                ...toasts.slice(indexOfExistingToast + 1),
              ];
            }

            // toast가 새로운 객체라면 맨 앞에 추가한다.
            return [toast, ...toasts];
          });
        });
      });
    });
  }, []);

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  React.useEffect(() => {
    // 시스템 테마를 사용하지 않는 경우
    if (theme !== 'system') {
      // 설정된 (default light) 테마로 설정
      setActualTheme(theme);
      return;
    }

    if (theme === 'system') {
      // check if current preference is dark
      // 시스템 체크해서 테마설정
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        // it's currently dark
        setActualTheme('dark');
      } else {
        // it's not dark
        setActualTheme('light');
      }
    }

    // 서버에선 동작하지않음
    if (typeof window === 'undefined') return;
    // 다크모드
    const darkMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    // 랜더링 이후 변경을 감지하도록 이벤트 등록
    try {
      // Chrome & Firefox
      darkMediaQuery.addEventListener('change', ({ matches }) => {
        if (matches) {
          setActualTheme('dark');
        } else {
          setActualTheme('light');
        }
      });
    } catch (error) {
      // Safari < 14
      darkMediaQuery.addListener(({ matches }) => {
        try {
          if (matches) {
            setActualTheme('dark');
          } else {
            setActualTheme('light');
          }
        } catch (e) {
          console.error(e);
        }
      });
    }
  }, [theme]);

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  React.useEffect(() => {
    // Ensure expanded is always false when no toasts are present / only one left
    // 토스트가 1개일때는 항상 expanded가 false인 상태가 된다.
    if (toasts.length <= 1) {
      setExpanded(false);
    }
  }, [toasts]);

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  React.useEffect(() => {
    // 미리 설정된 hotkey를 누르면
    const handleKeyDown = (event: KeyboardEvent) => {
      const isHotkeyPressed = hotkey.every((key) => (event as any)[key] || event.code === key);

      if (isHotkeyPressed) {
        setExpanded(true); // toast가 확장되고
        listRef.current?.focus(); // 포커스가 옮겨진다.
      }

      // esc를 누르면 확장된 것이 다시 닫힌다.
      if (
        event.code === 'Escape' &&
        (document.activeElement === listRef.current || listRef.current?.contains(document.activeElement))
      ) {
        setExpanded(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);

    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [hotkey]);

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  React.useEffect(() => {
    // 지금 화면에 toast가 있는데 언마운트 되면 이전 포커스를 초기화 => 토스트를 클릭하면 마지막포커스가 토스트로 와버리기 때문에 다음 tab키를 눌렀을때 포커싱을 잃는다.
    // 키보드 접근성 향상을 위해 toast 언마운트 이후에는 예전 포커스로 되돌려준다.
    if (listRef.current) {
      return () => {
        if (lastFocusedElementRef.current) {
          lastFocusedElementRef.current.focus({ preventScroll: true });
          lastFocusedElementRef.current = null;
          isFocusWithinRef.current = false;
        }
      };
    }
  }, [listRef.current]);

  return (
    // Remove item from normal navigation flow, only available via hotkey
    <section
      aria-label={`${containerAriaLabel} ${hotkeyLabel}`}
      tabIndex={-1}
      aria-live="polite"
      aria-relevant="additions text"
      aria-atomic="false"
    >
      {possiblePositions.map((position, index) => {
        const [y, x] = position.split('-');

        if (!toasts.length) return null;

        return (
          <ol
            key={position}
            dir={dir === 'auto' ? getDocumentDirection() : dir}
            tabIndex={-1}
            ref={listRef}
            className={className}
            data-sonner-toaster
            data-theme={actualTheme}
            data-y-position={y}
            data-lifted={expanded && toasts.length > 1 && !expand}
            data-x-position={x}
            style={
              {
                '--front-toast-height': `${heights[0]?.height || 0}px`,
                '--offset': typeof offset === 'number' ? `${offset}px` : offset || VIEWPORT_OFFSET,
                '--width': `${TOAST_WIDTH}px`,
                '--gap': `${gap}px`,
                ...style,
              } as React.CSSProperties
            }
            onBlur={(event) => {
              //접근성 키보드 이전 포커스 영역 기억
              if (isFocusWithinRef.current && !event.currentTarget.contains(event.relatedTarget)) {
                isFocusWithinRef.current = false; // 내부에서 포커스가 떠남을 표시
                if (lastFocusedElementRef.current) {
                  lastFocusedElementRef.current.focus({ preventScroll: true }); // 포커스가 벗어나면 자연스럽게 이전 요소로 포커스, 스크롤은 움직이지 않는다.
                  lastFocusedElementRef.current = null; // 포커스가 끝나면 null로 만들어서 초기화
                }
              }
            }}
            onFocus={(event) => {
              // data-dismissible="false"가 지정된 요소는 포커스 관리에서 제외(중요한 메세지는 사용자가 닫을 수 없게 함)
              const isNotDismissible =
                event.target instanceof HTMLElement && event.target.dataset.dismissible === 'false';

              if (isNotDismissible) return;

              // 처음으로 영역에 포커스가 들어오는 상황
              if (!isFocusWithinRef.current) {
                isFocusWithinRef.current = true; // 내부에 포커스 있음 표시
                lastFocusedElementRef.current = event.relatedTarget as HTMLElement; // 이전 포커스 영역을 저장
              }
            }}
            onMouseEnter={() => setExpanded(true)}
            onMouseMove={() => setExpanded(true)}
            onMouseLeave={() => {
              // Avoid setting expanded to false when interacting with a toast, e.g. swiping
              if (!interacting) {
                setExpanded(false);
              }
            }}
            onPointerDown={(event) => {
              const isNotDismissible =
                event.target instanceof HTMLElement && event.target.dataset.dismissible === 'false';

              if (isNotDismissible) return;
              setInteracting(true);
            }}
            onPointerUp={() => setInteracting(false)}
          >
            {toasts
              .filter((toast) => (!toast.position && index === 0) || toast.position === position)
              .map((toast, index) => (
                <Toast
                  key={toast.id}
                  icons={icons}
                  index={index}
                  toast={toast}
                  defaultRichColors={richColors}
                  duration={toastOptions?.duration ?? duration}
                  className={toastOptions?.className}
                  descriptionClassName={toastOptions?.descriptionClassName}
                  invert={invert}
                  visibleToasts={visibleToasts}
                  closeButton={toastOptions?.closeButton ?? closeButton}
                  interacting={interacting}
                  position={position}
                  style={toastOptions?.style}
                  unstyled={toastOptions?.unstyled}
                  classNames={toastOptions?.classNames}
                  cancelButtonStyle={toastOptions?.cancelButtonStyle}
                  actionButtonStyle={toastOptions?.actionButtonStyle}
                  removeToast={removeToast}
                  toasts={toasts.filter((t) => t.position == toast.position)}
                  heights={heights.filter((h) => h.position == toast.position)}
                  setHeights={setHeights}
                  expandByDefault={expand}
                  gap={gap}
                  loadingIcon={loadingIcon}
                  expanded={expanded}
                  pauseWhenPageIsHidden={pauseWhenPageIsHidden}
                  cn={cn}
                />
              ))}
          </ol>
        );
      })}
    </section>
  );
});
export { toast, Toaster, type ExternalToast, type ToastT, type ToasterProps, useSonner };
export { type ToastClassnames, type ToastToDismiss, type Action } from './types';
