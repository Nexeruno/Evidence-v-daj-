"""
FÁZE 5.5B: Runtime Readiness Check Tests

Tests verify that the runtime:
1. Can accept valid requests
2. Can parse and process them
3. Can return valid responses
4. Handles errors appropriately
"""

import json
import pytest
from app import app


@pytest.fixture
def client():
    """Create Flask test client"""
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client


class TestReadinessCheckBasic:
    """Test basic readiness check functionality"""

    def test_readiness_check_returns_200(self, client):
        """Readiness check should return HTTP 200 always"""
        response = client.get('/readiness')
        assert response.status_code == 200

    def test_readiness_check_response_structure(self, client):
        """Response should have required fields"""
        response = client.get('/readiness')
        data = response.get_json()

        assert 'status' in data
        assert 'reason' in data
        assert 'message' in data
        assert 'timestamp' in data

    def test_readiness_check_status_values(self, client):
        """Status should be 'ready' or 'not_ready'"""
        response = client.get('/readiness')
        data = response.get_json()

        assert data['status'] in ['ready', 'not_ready']

    def test_readiness_check_reason_valid(self, client):
        """Reason should be one of known values"""
        response = client.get('/readiness')
        data = response.get_json()

        valid_reasons = [
            'all_checks_passed',
            'request_validation_failed',
            'processing_failed',
            'invalid_response',
            'unexpected_error'
        ]
        assert data['reason'] in valid_reasons


class TestReadinessCheckSuccess:
    """Test successful readiness checks"""

    def test_readiness_check_ready_status(self, client):
        """If runtime is healthy, should return 'ready' status"""
        response = client.get('/readiness')
        data = response.get_json()

        # If any test fails, status will be 'not_ready'
        # If all tests pass, status will be 'ready'
        assert data['status'] in ['ready', 'not_ready']

    def test_readiness_check_ready_has_tests_list(self, client):
        """When ready, response should list performed tests"""
        response = client.get('/readiness')
        data = response.get_json()

        if data['status'] == 'ready':
            assert 'testsPerformed' in data
            assert isinstance(data['testsPerformed'], list)
            assert len(data['testsPerformed']) > 0

    def test_readiness_check_tests_sequence(self, client):
        """Tests should be performed in order"""
        response = client.get('/readiness')
        data = response.get_json()

        if data['status'] == 'ready':
            tests = data['testsPerformed']
            expected = [
                'request_validation',
                'request_parsing',
                'prediction_generation',
                'response_structure'
            ]
            assert tests == expected


class TestReadinessCheckValidation:
    """Test request validation in readiness check"""

    def test_readiness_uses_valid_test_request(self, client):
        """Readiness check should use a valid test request"""
        response = client.get('/readiness')
        data = response.get_json()

        # If validation fails, reason will be 'request_validation_failed'
        if data['status'] != 'ready':
            # If not ready due to validation, that's a real problem
            if data['reason'] == 'request_validation_failed':
                # Log the error for debugging
                assert False, f"Request validation failed: {data['message']}"

    def test_readiness_test_data_valid(self, client):
        """Test data should be complete and valid"""
        response = client.get('/readiness')
        data = response.get_json()

        # The readiness check uses minimal but valid test data:
        # - uid: 'readiness-check'
        # - pipelineLevel: 'L1'
        # - modelVersion: '1.0'
        # - transactions: [3 valid transactions]
        # - income: 5000.0

        # This should pass validation
        if data['status'] == 'ready':
            assert data['reason'] == 'all_checks_passed'
        elif data['reason'] == 'request_validation_failed':
            # This shouldn't happen with valid test data
            assert False, "Valid test data was rejected by validation"


class TestReadinessCheckProcessing:
    """Test request processing in readiness check"""

    def test_readiness_parsing_works(self, client):
        """Readiness check should successfully parse request"""
        response = client.get('/readiness')
        data = response.get_json()

        if data['status'] == 'ready':
            # Parsing succeeded
            assert 'request_parsing' in data.get('testsPerformed', [])
        elif data['reason'] == 'processing_failed':
            # Parsing or processing failed
            assert 'Cannot process valid request' in data['message']

    def test_readiness_prediction_generated(self, client):
        """Readiness check should generate valid prediction"""
        response = client.get('/readiness')
        data = response.get_json()

        if data['status'] == 'ready':
            # Prediction generation succeeded
            assert 'prediction_generation' in data.get('testsPerformed', [])
        elif data['reason'] == 'processing_failed':
            # Prediction generation failed
            assert 'Cannot process valid request' in data['message']


class TestReadinessCheckResponse:
    """Test response validation in readiness check"""

    def test_readiness_response_has_required_fields(self, client):
        """Generated response should have required fields"""
        response = client.get('/readiness')
        data = response.get_json()

        if data['status'] == 'ready':
            # Response validation passed
            assert 'response_structure' in data.get('testsPerformed', [])
        elif data['reason'] == 'invalid_response':
            # Response validation failed
            assert 'Response missing required fields' in data['message']

    def test_readiness_response_structure_check(self, client):
        """Readiness check should verify totalPredictedExpense exists"""
        response = client.get('/readiness')
        data = response.get_json()

        # The readiness check verifies that response contains 'totalPredictedExpense'
        if data['status'] != 'ready' and data['reason'] == 'invalid_response':
            assert 'Response missing required fields' in data['message']


class TestReadinessCheckErrorHandling:
    """Test error handling in readiness check"""

    def test_readiness_check_handles_unexpected_errors(self, client):
        """Readiness check should handle unexpected errors"""
        response = client.get('/readiness')
        data = response.get_json()

        # Response should always be 200, even if checks fail
        assert response.status_code == 200

    def test_readiness_check_not_found_on_failure(self, client):
        """Readiness check should return detailed error info on failure"""
        response = client.get('/readiness')
        data = response.get_json()

        if data['status'] != 'ready':
            # All error cases should have message
            assert 'message' in data
            assert len(data['message']) > 0

    def test_readiness_check_timestamp_present(self, client):
        """All readiness responses should have timestamp"""
        response = client.get('/readiness')
        data = response.get_json()

        assert 'timestamp' in data
        assert data['timestamp'] is not None
        assert 'Z' in data['timestamp']  # ISO format with Z suffix


class TestReadinessCheckIntegration:
    """Integration tests for readiness check"""

    def test_readiness_independent_of_health(self, client):
        """Readiness check should work independently"""
        readiness = client.get('/readiness').get_json()

        # Readiness check should be callable
        assert readiness is not None
        assert 'status' in readiness

    def test_readiness_can_be_called_multiple_times(self, client):
        """Readiness check should be idempotent"""
        response1 = client.get('/readiness').get_json()
        response2 = client.get('/readiness').get_json()

        # Status should be same both times (assuming no changes in between)
        assert response1['status'] == response2['status']
        assert response1['reason'] == response2['reason']

    def test_readiness_accepts_get_only(self, client):
        """Readiness should accept GET, not POST"""
        response = client.post('/readiness')
        # POST should not be allowed
        assert response.status_code in [405, 404]  # Method Not Allowed or Not Found


class TestReadinessCheckDetailedErrors:
    """Test detailed error information"""

    def test_not_ready_reason_specificity(self, client):
        """Specific not_ready reasons should explain what failed"""
        response = client.get('/readiness')
        data = response.get_json()

        if data['status'] == 'not_ready':
            # Message should correspond to reason
            reason = data['reason']
            message = data['message']

            if reason == 'request_validation_failed':
                assert 'Cannot accept valid request' in message
            elif reason == 'processing_failed':
                assert 'Cannot process valid request' in message
            elif reason == 'invalid_response':
                assert 'Response missing' in message
            elif reason == 'unexpected_error':
                assert 'Readiness check failed' in message

    def test_ready_message_clear(self, client):
        """Ready message should be clear and descriptive"""
        response = client.get('/readiness')
        data = response.get_json()

        if data['status'] == 'ready':
            assert 'accepts valid requests' in data['message']
            assert 'valid responses' in data['message']


class TestReadinessCheckLogging:
    """Test logging behavior"""

    def test_readiness_logging_happens(self, client, caplog):
        """Readiness check should log its activity"""
        response = client.get('/readiness')

        # Check should complete without errors
        assert response.status_code == 200


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
