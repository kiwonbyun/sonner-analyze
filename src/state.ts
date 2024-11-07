import type { ExternalToast, PromiseData, PromiseT, ToastT, ToastToDismiss, ToastTypes } from './types';

import React from 'react';

let toastsCounter = 1;

type titleT = (() => React.ReactNode) | React.ReactNode;

class Observer {
  subscribers: Array<(toast: ExternalToast | ToastToDismiss) => void>; // 토스트 상태 변화를 구독하는 함수들? => toast 상태가 변경될때마다 호출될 함수들.
  toasts: Array<ToastT | ToastToDismiss>; // 현재 활성화된 토스트들

  constructor() {
    this.subscribers = [];
    this.toasts = [];
  }

  // We use arrow functions to maintain the correct `this` reference
  // <Toaster /> 컴포넌트를 호출하거나, useSonner 훅을 호출하면 subscribe method가 호출되어 subscriber가 등록된다.
  subscribe = (subscriber: (toast: ToastT | ToastToDismiss) => void) => {
    // 인자로 받은 subscriber를 this.subscribers 배열에 추가함.
    this.subscribers.push(subscriber);

    // 이 리턴하는 함수가 useEffect의 클린업에 들어감. 즉, 언마운트될때 this.subscribers 배열에서 해당 subscriber를 추출함.
    return () => {
      const index = this.subscribers.indexOf(subscriber);
      // this.subscribers에서 subscriber 제거
      this.subscribers.splice(index, 1);
    };
  };

  // 지금 싱글톤 객체에 등록된 subscriber들을 매개변수를 인자로 호출함.
  publish = (data: ToastT) => {
    this.subscribers.forEach((subscriber) => subscriber(data));
  };

  addToast = (data: ToastT) => {
    // 싱글톤 객체의 subscriber들을 data를 인자로 호출 => <Toaster />컴포넌트 내부에 있는 지역 toasts 상태를 업데이트 시킴
    this.publish(data);
    // 싱글톤 객체의 toasts에 직접 data를 추가
    this.toasts = [...this.toasts, data];
  };

  create = (
    data: ExternalToast & {
      message?: titleT;
      type?: ToastTypes;
      promise?: PromiseT;
      jsx?: React.ReactElement;
    },
  ) => {
    const { message, ...rest } = data;
    const id = typeof data?.id === 'number' || data.id?.length > 0 ? data.id : toastsCounter++;
    const alreadyExists = this.toasts.find((toast) => {
      return toast.id === id;
    });
    const dismissible = data.dismissible === undefined ? true : data.dismissible;

    // 만약 매개변수로 받은 data가 이미 this.toasts에 존재하는 toasts라면 업데이트라고 판단을 하고,
    if (alreadyExists) {
      // this.toasts를 업데이트 하는데, 기존 내용이 매개변수로 받은 data로 업데이트를 하고
      this.toasts = this.toasts.map((toast) => {
        if (toast.id === id) {
          // 지금 싱글톤 객체에 등록된 subscriber들을 호출하면서 업데이트 된 객체를 넘겨준다.
          this.publish({ ...toast, ...data, id, title: message });
          return {
            ...toast,
            ...data,
            id,
            dismissible,
            title: message,
          };
        }

        return toast;
      });
      // 위와같이 하게되면 싱글톤 객체도 업데이트가 되고, subscriber가 참조하는 지역상태도 업데이트 된다.
    } else {
      // 아니면 완전 새 toast면 그냥 addToast호출, addToast가 알아서 지역상태와 싱글톤객체도 업데이트 해줌.
      this.addToast({ title: message, ...rest, dismissible, id });
    }

    // this.create의 반환값은 생성한 toast의 id이다.
    return id;
  };

  dismiss = (id?: number | string) => {
    // 만약, id 없이 호출되면
    if (!id) {
      // 현재 toasts의 갯수만큼 subscriber를 호출하면서 인자로 모든 toast의 id로 {id, dismiss:true}를 준다.
      this.toasts.forEach((toast) => {
        // 지역상태 관리자로 등록되는 subscriber들은 이 인자를 받으면 지역상태에서 걸러버리거나, delete속성을 true로 바꾼다.
        // 모든 toasts가 delete:true가 될 것으로 예상함.
        this.subscribers.forEach((subscriber) => subscriber({ id: toast.id, dismiss: true }));
      });
    }
    // 만약, 특정 id가 있다면 모든 subscriber를 특정 id로 {id, dismiss:true} 인자로 호출한다.
    this.subscribers.forEach((subscriber) => subscriber({ id, dismiss: true }));
    // 반환값은 매개변수로 받은 id 그대로 반환
    return id;
  };

  // 사용자가 toast.message()로 호출할 수 있음. ex. ('string', { description: 'string' })
  message = (message: titleT | React.ReactNode, data?: ExternalToast) => {
    // this.create({description: 'string', message: 'string'})로 호출됨.
    // 순차적으로 create -> addToast 가 호출되어, 지역상태와 싱글톤객체의 toasts배열에 추가함.
    return this.create({ ...data, message });
  };

  error = (message: titleT | React.ReactNode, data?: ExternalToast) => {
    // this.create({description: 'string', message: 'string', type:"error"})로 호출됨.
    // 순차적으로 create -> addToast 가 호출되어, 지역상태와 싱글톤객체의 toasts배열에 추가함.
    return this.create({ ...data, message, type: 'error' });
  };

  success = (message: titleT | React.ReactNode, data?: ExternalToast) => {
    // this.create({description: 'string', message: 'string', type:"success"})로 호출됨.
    // 순차적으로 create -> addToast 가 호출되어, 지역상태와 싱글톤객체의 toasts배열에 추가함.
    return this.create({ ...data, type: 'success', message });
  };

  info = (message: titleT | React.ReactNode, data?: ExternalToast) => {
    // this.create({description: 'string', message: 'string', type:"info"})로 호출됨.
    // 순차적으로 create -> addToast 가 호출되어, 지역상태와 싱글톤객체의 toasts배열에 추가함.
    return this.create({ ...data, type: 'info', message });
  };

  warning = (message: titleT | React.ReactNode, data?: ExternalToast) => {
    // this.create({description: 'string', message: 'string', type:"warning"})로 호출됨.
    // 순차적으로 create -> addToast 가 호출되어, 지역상태와 싱글톤객체의 toasts배열에 추가함.
    return this.create({ ...data, type: 'warning', message });
  };

  loading = (message: titleT | React.ReactNode, data?: ExternalToast) => {
    // this.create({description: 'string', message: 'string', type:"loading"})로 호출됨.
    // 순차적으로 create -> addToast 가 호출되어, 지역상태와 싱글톤객체의 toasts배열에 추가함.
    return this.create({ ...data, type: 'loading', message });
  };

  promise = <ToastData>(promise: PromiseT<ToastData>, data?: PromiseData<ToastData>) => {
    if (!data) {
      // Nothing to show
      return;
    }

    let id: string | number | undefined = undefined;
    if (data.loading !== undefined) {
      id = this.create({
        ...data,
        promise,
        type: 'loading',
        message: data.loading,
        description: typeof data.description !== 'function' ? data.description : undefined,
      });
    }

    const p = promise instanceof Promise ? promise : promise();

    let shouldDismiss = id !== undefined;
    let result: ['resolve', ToastData] | ['reject', unknown];

    const originalPromise = p
      .then(async (response) => {
        result = ['resolve', response];
        const isReactElementResponse = React.isValidElement(response);
        if (isReactElementResponse) {
          shouldDismiss = false;
          this.create({ id, type: 'default', message: response });
        } else if (isHttpResponse(response) && !response.ok) {
          shouldDismiss = false;
          const message =
            typeof data.error === 'function' ? await data.error(`HTTP error! status: ${response.status}`) : data.error;
          const description =
            typeof data.description === 'function'
              ? await data.description(`HTTP error! status: ${response.status}`)
              : data.description;
          this.create({ id, type: 'error', message, description });
        } else if (data.success !== undefined) {
          shouldDismiss = false;
          const message = typeof data.success === 'function' ? await data.success(response) : data.success;
          const description =
            typeof data.description === 'function' ? await data.description(response) : data.description;
          this.create({ id, type: 'success', message, description });
        }
      })
      .catch(async (error) => {
        result = ['reject', error];
        if (data.error !== undefined) {
          shouldDismiss = false;
          const message = typeof data.error === 'function' ? await data.error(error) : data.error;
          const description = typeof data.description === 'function' ? await data.description(error) : data.description;
          this.create({ id, type: 'error', message, description });
        }
      })
      .finally(() => {
        if (shouldDismiss) {
          // Toast is still in load state (and will be indefinitely — dismiss it)
          this.dismiss(id);
          id = undefined;
        }

        data.finally?.();
      });

    const unwrap = () =>
      new Promise<ToastData>((resolve, reject) =>
        originalPromise.then(() => (result[0] === 'reject' ? reject(result[1]) : resolve(result[1]))).catch(reject),
      );

    if (typeof id !== 'string' && typeof id !== 'number') {
      // cannot Object.assign on undefined
      return { unwrap };
    } else {
      return Object.assign(id, { unwrap });
    }
  };

  custom = (jsx: (id: number | string) => React.ReactElement, data?: ExternalToast) => {
    const id = data?.id || toastsCounter++;
    // this.create({jsx, id, ...})로 호출됨.
    // 순차적으로 create -> addToast 가 호출되어, 지역상태와 싱글톤객체의 toasts배열에 추가함.
    this.create({ jsx: jsx(id), id, ...data });
    return id;
  };
}

// 싱글톤 패턴으로 앱 전체에 하나의 인스턴스만 존재함.
export const ToastState = new Observer();

// bind this to the toast function
const toastFunction = (message: titleT, data?: ExternalToast) => {
  const id = data?.id || toastsCounter++;

  ToastState.addToast({
    title: message,
    ...data,
    id,
  });
  return id;
};

const isHttpResponse = (data: any): data is Response => {
  return (
    data &&
    typeof data === 'object' &&
    'ok' in data &&
    typeof data.ok === 'boolean' &&
    'status' in data &&
    typeof data.status === 'number'
  );
};

const basicToast = toastFunction;

const getHistory = () => ToastState.toasts;

// We use `Object.assign` to maintain the correct types as we would lose them otherwise
export const toast = Object.assign(
  basicToast,
  {
    success: ToastState.success,
    info: ToastState.info,
    warning: ToastState.warning,
    error: ToastState.error,
    custom: ToastState.custom,
    message: ToastState.message,
    promise: ToastState.promise,
    dismiss: ToastState.dismiss,
    loading: ToastState.loading,
  },
  { getHistory },
);
