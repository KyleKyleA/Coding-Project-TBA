// Author: Kyle Angeles
// File-Name: error.js
// Date - 2026/08/01
// Description: This file handles the error handling for http status code 
// This just contains the most basic structure for the errors
// once v1 is complete, this will be updated to include all the other http status codes



// TODO: Add more http status codes and their corresponding error messages to the error page.";
// After v1 is  complete
class SimpleErrorBoundary extends Error {

    constructor(props) {
        super(props);
        this.state = {hasError: false};

    }

    static getDerivedStateFromError(error) {

        return {hasError: true, message: error?.message ?? 'Unkown Error'};
    }

    componentDidCatch(error, errorInfo) {
        logErrorToService(error, errorInfo)
    }

    render() {
        if (this.state.hasError) {
            return (
                <div>
                    <h1 className="error-header">Error 404</h1>
                    <p className="error-message">{this.state.message}</p>
                </div>
            );
        }
        return this.props.children;
    }
}

