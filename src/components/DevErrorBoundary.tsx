import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };

type State = { error: Error | null; info: ErrorInfo | null };

/**
 * 개발 중 렌더·훅 예외로 빈 화면이 될 때 메시지를 보여준다.
 */
export class DevErrorBoundary extends Component<Props, State> {
    state: State = { error: null, info: null };

    static getDerivedStateFromError(error: Error): Partial<State> {
        return { error };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        this.setState({ error, info });
        // eslint-disable-next-line no-console
        console.error('App render error:', error, info.componentStack);
    }

    render() {
        if (this.state.error) {
            return (
                <div
                    style={{
                        padding: 24,
                        fontFamily: 'system-ui, sans-serif',
                        maxWidth: 720,
                        margin: '0 auto',
                    }}
                >
                    <h1 style={{ fontSize: 18, marginBottom: 12 }}>화면을 그리다 오류가 났습니다</h1>
                    <p style={{ color: '#64748b', marginBottom: 16 }}>
                        브라우저 콘솔(F12)에도 같은 내용이 출력됩니다. 아래를 복사해 두면 원인 파악에 도움이 됩니다.
                    </p>
                    <pre
                        style={{
                            background: '#0f172a',
                            color: '#e2e8f0',
                            padding: 16,
                            borderRadius: 8,
                            overflow: 'auto',
                            fontSize: 12,
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                        }}
                    >
                        {this.state.error.stack || this.state.error.message}
                    </pre>
                    {this.state.info?.componentStack ? (
                        <pre
                            style={{
                                marginTop: 12,
                                background: '#1e293b',
                                color: '#94a3b8',
                                padding: 16,
                                borderRadius: 8,
                                overflow: 'auto',
                                fontSize: 11,
                                whiteSpace: 'pre-wrap',
                            }}
                        >
                            {this.state.info.componentStack}
                        </pre>
                    ) : null}
                    <p style={{ marginTop: 16 }}>
                        <button
                            type="button"
                            onClick={() => {
                                try {
                                    localStorage.removeItem('auth-storage');
                                    localStorage.removeItem('project-storage');
                                    localStorage.removeItem('auth-token');
                                } catch {
                                    /* ignore */
                                }
                                window.location.reload();
                            }}
                            style={{
                                padding: '8px 14px',
                                cursor: 'pointer',
                                borderRadius: 6,
                                border: '1px solid #cbd5e1',
                                background: '#fff',
                            }}
                        >
                            로컬 저장 데이터 지우고 새로고침
                        </button>
                    </p>
                </div>
            );
        }
        return this.props.children;
    }
}
