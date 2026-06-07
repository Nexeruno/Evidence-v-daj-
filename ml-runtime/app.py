"""
FÁZE 5.0A: External Python ML Runtime Server
First real external Python entrypoint (not Node.js baseline)

This server accepts ML pipeline requests from Node/Firebase layer
and processes them with Python, returning structured results.
"""

from flask import Flask, request, jsonify
from datetime import datetime
import logging
import json
from typing import Dict, List, Any, Tuple

# Configuration
app = Flask(__name__)
PORT = 5000
DEBUG = True

# Logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════════════════════════════════
# 🔒 CONTRACT VALIDATION - Request/Response Shape Validation
# ═══════════════════════════════════════════════════════════════════════════════

class RequestContract:
    """Validates incoming request shape with detailed validation"""

    REQUIRED_FIELDS = {
        'uid': str,
        'pipelineLevel': str,
        'modelVersion': str,
    }

    OPTIONAL_FIELDS = {
        'transactions': list,
        'income': (int, float),
        'debugMode': bool,
    }

    # Valid pipeline levels
    VALID_PIPELINE_LEVELS = ['L1', 'L2', 'L3']

    @staticmethod
    def validate_semantic_version(version: str) -> bool:
        """Check if version is semantic version format (e.g., 1.0.0 or 1.0)"""
        if not isinstance(version, str):
            return False
        parts = version.split('.')
        return len(parts) >= 2 and all(part.isdigit() for part in parts)

    @staticmethod
    def validate_transaction(tx: Dict, index: int) -> Tuple[bool, str]:
        """Validate individual transaction structure"""
        if not isinstance(tx, dict):
            return False, f"Transaction {index}: must be an object, got {type(tx).__name__}"

        # Check required fields
        if 'category' not in tx:
            return False, f"Transaction {index}: missing 'category' field"
        if 'amount' not in tx:
            return False, f"Transaction {index}: missing 'amount' field"
        if 'date' not in tx:
            return False, f"Transaction {index}: missing 'date' field"

        # Validate types
        if not isinstance(tx.get('category'), str):
            return False, f"Transaction {index}: 'category' must be string, got {type(tx.get('category')).__name__}"
        if not isinstance(tx.get('amount'), (int, float)):
            return False, f"Transaction {index}: 'amount' must be number, got {type(tx.get('amount')).__name__}"
        if not isinstance(tx.get('date'), str):
            return False, f"Transaction {index}: 'date' must be string, got {type(tx.get('date')).__name__}"

        # Validate values
        if not tx.get('category').strip():
            return False, f"Transaction {index}: 'category' cannot be empty"
        if tx.get('amount') < 0:
            return False, f"Transaction {index}: 'amount' must be >= 0, got {tx.get('amount')}"

        return True, ""

    @staticmethod
    def validate(data: Dict) -> Tuple[bool, str]:
        """
        Validate request shape with detailed error messages
        Returns: (is_valid, error_message)
        """
        if not isinstance(data, dict):
            return False, f"Request must be JSON object, got {type(data).__name__}"

        # Check required fields
        for field, expected_type in RequestContract.REQUIRED_FIELDS.items():
            if field not in data:
                return False, f"Missing required field: {field}"
            if not isinstance(data[field], expected_type):
                return False, f"Field '{field}' must be {expected_type.__name__}, got {type(data[field]).__name__}"

        # Validate uid (non-empty string)
        uid = data.get('uid', '').strip()
        if not uid:
            return False, "Field 'uid' cannot be empty"
        if len(uid) > 256:
            return False, f"Field 'uid' exceeds maximum length (256 chars)"

        # Validate pipelineLevel (must be L1, L2, or L3)
        pipeline_level = data.get('pipelineLevel', '').upper()
        if pipeline_level not in RequestContract.VALID_PIPELINE_LEVELS:
            return False, f"Field 'pipelineLevel' must be one of {RequestContract.VALID_PIPELINE_LEVELS}, got '{data.get('pipelineLevel')}'"

        # Validate modelVersion (semantic version)
        model_version = data.get('modelVersion', '')
        if not RequestContract.validate_semantic_version(model_version):
            return False, f"Field 'modelVersion' must be semantic version (e.g., 1.0 or 1.0.0), got '{model_version}'"

        # Check optional fields if present
        for field, expected_type in RequestContract.OPTIONAL_FIELDS.items():
            if field in data:
                value = data[field]
                if not isinstance(value, expected_type):
                    type_name = ' or '.join(t.__name__ for t in expected_type) if isinstance(expected_type, tuple) else expected_type.__name__
                    return False, f"Field '{field}' must be {type_name}, got {type(value).__name__}"

        # Validate transactions array if present
        if 'transactions' in data:
            transactions = data.get('transactions', [])
            if not isinstance(transactions, list):
                return False, f"Field 'transactions' must be array, got {type(transactions).__name__}"

            if len(transactions) > 10000:
                return False, f"Field 'transactions' exceeds maximum count (10000 items)"

            for idx, tx in enumerate(transactions):
                is_valid, error_msg = RequestContract.validate_transaction(tx, idx)
                if not is_valid:
                    return False, error_msg

        # Validate income if present
        if 'income' in data:
            income = data.get('income')
            if income < 0:
                return False, f"Field 'income' must be >= 0, got {income}"
            if income > 1000000000:  # 1 billion limit
                return False, f"Field 'income' exceeds maximum value (1,000,000,000)"

        return True, ""


# ═══════════════════════════════════════════════════════════════════════════════
# 📥 REQUEST PARSING - Input Parsing & Normalization
# ═══════════════════════════════════════════════════════════════════════════════

class RequestParser:
    """Parses and normalizes incoming request data"""

    @staticmethod
    def parse_transaction(tx: Dict) -> Dict:
        """Parse and normalize transaction data"""
        return {
            'category': str(tx.get('category', '')).strip().lower(),
            'amount': float(tx.get('amount', 0)),
            'date': str(tx.get('date', '')).strip(),
        }

    @staticmethod
    def parse(data: Dict) -> Dict:
        """
        Parse request data and return normalized form

        Returns normalized request with:
        - uid: trimmed, as-is
        - pipelineLevel: normalized to uppercase (L1, L2, L3)
        - modelVersion: as-is
        - transactions: parsed array of normalized transactions
        - income: float (default 0)
        - debugMode: boolean (default False)
        """
        # Validate first
        is_valid, error_msg = RequestContract.validate(data)
        if not is_valid:
            raise ValueError(error_msg)

        # Parse and normalize
        parsed = {
            'uid': str(data.get('uid', '')).strip(),
            'pipelineLevel': str(data.get('pipelineLevel', '')).upper(),
            'modelVersion': str(data.get('modelVersion', '')),
            'transactions': [
                RequestParser.parse_transaction(tx)
                for tx in data.get('transactions', [])
            ],
            'income': float(data.get('income', 0)),
            'debugMode': bool(data.get('debugMode', False)),
            # Metadata
            '_originalData': data,  # Keep original for debugging
        }

        return parsed

    @staticmethod
    def get_summary(parsed_data: Dict) -> Dict:
        """Get summary of parsed request for logging"""
        return {
            'uid': parsed_data['uid'],
            'pipelineLevel': parsed_data['pipelineLevel'],
            'modelVersion': parsed_data['modelVersion'],
            'transactionCount': len(parsed_data['transactions']),
            'income': parsed_data['income'],
            'debugMode': parsed_data['debugMode'],
        }


# ═══════════════════════════════════════════════════════════════════════════════
# 🎯 FEATURE EXTRACTION - Real Dataset Row Processing (FÁZE 5.2B)
# ═══════════════════════════════════════════════════════════════════════════════

class FeatureExtractor:
    """
    FÁZE 5.2B: Extract and validate features from real dataset rows
    Handles feature values, target presence info, and training metadata
    """

    @staticmethod
    def extract_features(transaction: Dict) -> Dict:
        """Extract features from single transaction row"""
        return {
            'category': str(transaction.get('category', '')).strip().lower(),
            'amount': float(transaction.get('amount', 0)),
            'date': str(transaction.get('date', '')).strip(),
            'amount_numeric': float(transaction.get('amount', 0)) > 0,
        }

    @staticmethod
    def validate_features(transactions: List[Dict]) -> Tuple[bool, str]:
        """
        Validate that features are present and valid
        Returns: (is_valid, error_message)
        """
        if not transactions:
            return True, ""  # Empty is valid, just means no data

        for idx, tx in enumerate(transactions):
            if not isinstance(tx, dict):
                return False, f"Row {idx}: Transaction must be object, got {type(tx).__name__}"

            # Check feature fields exist
            if 'category' not in tx:
                return False, f"Row {idx}: Missing feature 'category'"
            if 'amount' not in tx:
                return False, f"Row {idx}: Missing feature 'amount'"
            if 'date' not in tx:
                return False, f"Row {idx}: Missing feature 'date'"

            # Validate feature types
            if not isinstance(tx.get('category'), str) or not tx.get('category').strip():
                return False, f"Row {idx}: Feature 'category' must be non-empty string"
            if not isinstance(tx.get('amount'), (int, float)):
                return False, f"Row {idx}: Feature 'amount' must be numeric"
            if tx.get('amount') < 0:
                return False, f"Row {idx}: Feature 'amount' cannot be negative"
            if not isinstance(tx.get('date'), str) or not tx.get('date').strip():
                return False, f"Row {idx}: Feature 'date' must be non-empty string"

        return True, ""

    @staticmethod
    def analyze_feature_coverage(transactions: List[Dict]) -> Dict:
        """Analyze what features are present and their quality"""
        if not transactions:
            return {
                'totalRows': 0,
                'featurePresence': {
                    'category': 0,
                    'amount': 0,
                    'date': 0,
                },
                'uniqueCategories': 0,
                'amountRange': None,
            }

        categories_present = sum(1 for t in transactions if 'category' in t and t.get('category', '').strip())
        amounts_present = sum(1 for t in transactions if 'amount' in t)
        dates_present = sum(1 for t in transactions if 'date' in t and t.get('date', '').strip())

        unique_categories = len(set(str(t.get('category', '')).strip().lower() for t in transactions if t.get('category', '').strip()))

        amounts = [float(t.get('amount', 0)) for t in transactions if isinstance(t.get('amount'), (int, float)) and t.get('amount') >= 0]
        amount_range = None
        if amounts:
            amount_range = {'min': round(min(amounts), 2), 'max': round(max(amounts), 2)}

        return {
            'totalRows': len(transactions),
            'featurePresence': {
                'category': round(categories_present / len(transactions) * 100, 1),
                'amount': round(amounts_present / len(transactions) * 100, 1),
                'date': round(dates_present / len(transactions) * 100, 1),
            },
            'uniqueCategories': unique_categories,
            'amountRange': amount_range,
        }


class TargetInfo:
    """
    FÁZE 5.2B: Detect and validate target presence for training
    Target = what we're trying to predict (monthly expenses)
    """

    @staticmethod
    def extract_targets(transactions: List[Dict]) -> Dict:
        """Extract target values (monthly aggregated expenses) from transactions"""
        if not transactions:
            return {}

        monthly_totals = {}
        for tx in transactions:
            date_str = str(tx.get('date', '')).strip()
            amount = float(tx.get('amount', 0))

            if date_str and len(date_str) >= 7:  # YYYY-MM format
                month_key = date_str[:7]
                if month_key not in monthly_totals:
                    monthly_totals[month_key] = 0
                monthly_totals[month_key] += amount

        return monthly_totals

    @staticmethod
    def validate_target_presence(transactions: List[Dict], income: float = None) -> Tuple[bool, str]:
        """
        Validate that we have target information
        For expense prediction, target = monthly expense totals
        Returns: (is_valid, error_message)
        """
        if not transactions:
            return False, "Cannot validate target: no transactions provided"

        # Check if we can extract monthly targets
        targets = TargetInfo.extract_targets(transactions)

        if not targets:
            return False, "Cannot extract target values: transactions must have valid dates in YYYY-MM format"

        if len(targets) < 1:
            return False, "Cannot validate target: insufficient monthly data (need at least 1 month)"

        return True, ""

    @staticmethod
    def analyze_target_quality(transactions: List[Dict]) -> Dict:
        """Analyze quality of target data for training"""
        targets = TargetInfo.extract_targets(transactions)

        if not targets:
            return {
                'targetPresence': False,
                'monthsAvailable': 0,
                'targetDataPoints': 0,
                'targetRange': None,
                'recommendation': 'Cannot perform training: no valid monthly targets found',
            }

        sorted_months = sorted(targets.keys())
        values = list(targets.values())

        return {
            'targetPresence': True,
            'monthsAvailable': len(sorted_months),
            'targetDataPoints': len(values),
            'targetRange': {
                'min': round(min(values), 2),
                'max': round(max(values), 2),
                'mean': round(sum(values) / len(values), 2),
            },
            'timeSpan': f"{sorted_months[0]} to {sorted_months[-1]}",
            'recommendation': 'Ready for training' if len(sorted_months) >= 3 else f'Limited data: {len(sorted_months)} months (recommend 3+)',
        }


class DatasetMetadata:
    """
    FÁZE 5.2B: Generate metadata about dataset for first use-case
    Tracks what data we have and whether it's suitable for training
    """

    @staticmethod
    def generate(transactions: List[Dict], income: float = None) -> Dict:
        """Generate comprehensive metadata about dataset"""
        feature_coverage = FeatureExtractor.analyze_feature_coverage(transactions)
        target_quality = TargetInfo.analyze_target_quality(transactions)

        total_expense = sum(float(t.get('amount', 0)) for t in transactions if isinstance(t.get('amount'), (int, float)))

        return {
            'datasetSize': {
                'totalRows': len(transactions),
                'featurePresence': feature_coverage['featurePresence'],
                'uniqueCategories': feature_coverage['uniqueCategories'],
            },
            'features': {
                'amountRange': feature_coverage['amountRange'],
                'categoriesPresent': feature_coverage['uniqueCategories'] > 0,
                'datesPresent': feature_coverage['featurePresence']['date'] > 0,
            },
            'targets': {
                'monthlyTargets': target_quality['targetPresence'],
                'monthsAvailable': target_quality['monthsAvailable'],
                'timeSpan': target_quality.get('timeSpan', 'N/A'),
                'targetRange': target_quality.get('targetRange'),
            },
            'income': {
                'provided': income is not None and income > 0,
                'amount': round(income, 2) if income and income > 0 else None,
            },
            'summary': {
                'totalExpense': round(total_expense, 2),
                'readyForTraining': target_quality['targetPresence'] and feature_coverage['featurePresence']['category'] >= 80,
                'recommendation': target_quality.get('recommendation', 'Unknown'),
            }
        }


class ResponseContract:
    """Builds and validates outgoing response shape"""

    @staticmethod
    def build(request_data: Dict, predictions: List[Dict], error: str = None) -> Dict:
        """
        Build response following contract shape
        FÁZE 5.1B: Added top-level 'result' field with confidence
        FÁZE 5.1C: Added input summary and confidence explanation in debugMetadata

        Response Contract Shape:
        {
            "status": "success" | "failed",
            "uid": "user-123",
            "pipelineLevel": "L1" | "L2" | "L3",
            "modelVersion": "1.0",
            "processedAt": "2026-06-07T15:30:00.000Z",
            "result": {
                "predictedExpense": 3500.00,
                "confidence": 0.87,
                "confidenceFactors": {
                    "dataFrequency": 0.5,
                    "transactionCount": 0.9,
                    "expenseRatio": 0.2,
                    "incomeConstraint": 1.0
                }
            },
            "predictions": [
                {
                    "period": "2026-06",
                    "totalPredictedExpense": 3500.00,
                    "confidence": 0.87,
                    "confidenceFactors": {...},
                    "categories": {"food": 1200.00, "transport": 800.00},
                    "dataPoints": 45,
                    "pipelineLevel": "L1"
                }
            ],
            "error": null | "error message",
            "debugMetadata": {
                "processingTimeMs": 125,
                "pythonRuntime": "3.9",
                "frameworkVersion": "Flask/2.3.2",
                "inputs": {
                    "transactions": 45,
                    "monthsOfHistory": 6,
                    "totalHistoricalExpense": 23500.00,
                    "income": 5000.00,
                    "expenseToIncomeRatio": "4.7x"
                },
                "confidenceExplained": {
                    "dataFrequency": "50% (6 months)",
                    "transactionCount": "90% (45 txns)",
                    "expenseRatio": "20% (4.7x income)",
                    "incomeConstraint": "100% (provided)"
                },
                "calculationMethod": "weighted recent (60%) + overall (40%) average",
                "parsed": {...}
            }
        }
        """
        status = 'failed' if error else 'success'

        # Build result field from first prediction if success
        result = None
        if not error and predictions and len(predictions) > 0:
            first_pred = predictions[0]
            result = {
                'predictedExpense': first_pred.get('totalPredictedExpense', 0.0),
                'confidence': first_pred.get('confidence', 0.0),
                'confidenceFactors': first_pred.get('confidenceFactors', {})
            }

        response = {
            'status': status,
            'uid': request_data.get('uid'),
            'pipelineLevel': request_data.get('pipelineLevel'),
            'modelVersion': request_data.get('modelVersion'),
            'processedAt': datetime.utcnow().isoformat() + 'Z',
            'result': result,
            'predictions': predictions if not error else [],
            'error': error,
            'debugMetadata': {
                'processingTimeMs': 0,  # Will be set by caller
                'pythonRuntime': '3.9',
                'frameworkVersion': 'Flask/2.3.2'
            }
        }

        return response

    @staticmethod
    def validate(response: Dict) -> Tuple[bool, str]:
        """
        Validate response shape matches contract
        FÁZE 5.1B: Validates result field and confidenceFactors
        Returns: (is_valid, error_message)
        """
        # Check required top-level fields (including new 'result' field)
        required_fields = ['status', 'uid', 'pipelineLevel', 'modelVersion', 'processedAt', 'result', 'predictions', 'error', 'debugMetadata']
        for field in required_fields:
            if field not in response:
                return False, f"Response missing required field: {field}"

        # Validate status
        if response['status'] not in ['success', 'failed']:
            return False, f"Response 'status' must be 'success' or 'failed', got '{response['status']}'"

        # Validate result field (if success)
        if response['status'] == 'success':
            if response['result'] is None:
                return False, "Response 'result' must not be null for successful response"
            if not isinstance(response['result'], dict):
                return False, f"Response 'result' must be object, got {type(response['result']).__name__}"

            # Validate result fields
            result_required = ['predictedExpense', 'confidence', 'confidenceFactors']
            for field in result_required:
                if field not in response['result']:
                    return False, f"Result missing field: {field}"

            # Validate result types
            if not isinstance(response['result']['predictedExpense'], (int, float)):
                return False, "Result 'predictedExpense' must be number"
            if not isinstance(response['result']['confidence'], (int, float)):
                return False, "Result 'confidence' must be number"
            if not isinstance(response['result']['confidenceFactors'], dict):
                return False, "Result 'confidenceFactors' must be object"

            # Validate confidence factors
            factors_required = ['dataFrequency', 'transactionCount', 'expenseRatio', 'incomeConstraint']
            for factor in factors_required:
                if factor not in response['result']['confidenceFactors']:
                    return False, f"ConfidenceFactors missing: {factor}"
                if not isinstance(response['result']['confidenceFactors'][factor], (int, float)):
                    return False, f"ConfidenceFactors '{factor}' must be number"

        # Validate predictions array
        if not isinstance(response['predictions'], list):
            return False, f"Response 'predictions' must be array, got {type(response['predictions']).__name__}"

        # If success, predictions must be non-empty
        if response['status'] == 'success' and len(response['predictions']) == 0:
            return False, "Response 'predictions' must not be empty for successful response"

        # Validate each prediction
        for idx, pred in enumerate(response['predictions']):
            if not isinstance(pred, dict):
                return False, f"Prediction {idx} must be object, got {type(pred).__name__}"

            # Check required prediction fields
            pred_required = ['period', 'totalPredictedExpense', 'confidence', 'confidenceFactors', 'categories', 'dataPoints', 'pipelineLevel']
            for field in pred_required:
                if field not in pred:
                    return False, f"Prediction {idx} missing field: {field}"

            # Validate types
            if not isinstance(pred['period'], str):
                return False, f"Prediction {idx} 'period' must be string, got {type(pred['period']).__name__}"
            if not isinstance(pred['totalPredictedExpense'], (int, float)):
                return False, f"Prediction {idx} 'totalPredictedExpense' must be number"
            if not isinstance(pred['confidence'], (int, float)):
                return False, f"Prediction {idx} 'confidence' must be number"
            if not isinstance(pred['confidenceFactors'], dict):
                return False, f"Prediction {idx} 'confidenceFactors' must be object"
            if not isinstance(pred['categories'], dict):
                return False, f"Prediction {idx} 'categories' must be object"
            if not isinstance(pred['dataPoints'], int):
                return False, f"Prediction {idx} 'dataPoints' must be integer"

            # Validate value ranges
            if pred['totalPredictedExpense'] < 0:
                return False, f"Prediction {idx} 'totalPredictedExpense' must be >= 0"
            if not (0 <= pred['confidence'] <= 1):
                return False, f"Prediction {idx} 'confidence' must be between 0 and 1"
            if pred['dataPoints'] < 0:
                return False, f"Prediction {idx} 'dataPoints' must be >= 0"

        # Validate debugMetadata
        if not isinstance(response['debugMetadata'], dict):
            return False, "Response 'debugMetadata' must be object"
        if 'processingTimeMs' not in response['debugMetadata']:
            return False, "DebugMetadata must have 'processingTimeMs'"

        return True, ""


# ═══════════════════════════════════════════════════════════════════════════════
# 📊 FEATURE ANALYSIS - Real feature-based insights (FÁZE 5.2C)
# ═══════════════════════════════════════════════════════════════════════════════

class FeatureAnalyzer:
    """
    FÁZE 5.2C: Analyze real feature patterns to inform deterministic predictions
    Instead of generic placeholders, use actual feature data
    """

    @staticmethod
    def analyze_category_distribution(transactions: List[Dict]) -> Dict:
        """Analyze category patterns in transactions"""
        if not transactions:
            return {}

        category_totals = {}
        category_counts = {}

        for tx in transactions:
            category = str(tx.get('category', 'other')).strip().lower()
            amount = float(tx.get('amount', 0))

            if category not in category_totals:
                category_totals[category] = 0
                category_counts[category] = 0
            category_totals[category] += amount
            category_counts[category] += 1

        # Calculate category statistics
        total_expense = sum(category_totals.values())
        distribution = {}

        for category in sorted(category_totals.keys()):
            amount = category_totals[category]
            count = category_counts[category]
            pct = (amount / total_expense * 100) if total_expense > 0 else 0

            distribution[category] = {
                'totalAmount': round(amount, 2),
                'transactionCount': count,
                'averageAmount': round(amount / count, 2) if count > 0 else 0,
                'percentOfTotal': round(pct, 1),
            }

        return distribution

    @staticmethod
    def analyze_amount_patterns(transactions: List[Dict]) -> Dict:
        """Analyze amount distribution patterns"""
        if not transactions:
            return {}

        amounts = [float(tx.get('amount', 0)) for tx in transactions if float(tx.get('amount', 0)) > 0]

        if not amounts:
            return {'count': 0}

        amounts_sorted = sorted(amounts)
        n = len(amounts_sorted)

        # Calculate statistics
        total = sum(amounts)
        mean = total / n
        median = amounts_sorted[n // 2] if n > 0 else 0
        min_amt = min(amounts)
        max_amt = max(amounts)

        # Calculate standard deviation
        variance = sum((x - mean) ** 2 for x in amounts) / n if n > 0 else 0
        std_dev = variance ** 0.5

        # Calculate percentiles
        p25_idx = int(n * 0.25)
        p75_idx = int(n * 0.75)
        p25 = amounts_sorted[p25_idx] if p25_idx < n else amounts_sorted[-1]
        p75 = amounts_sorted[p75_idx] if p75_idx < n else amounts_sorted[-1]

        return {
            'count': n,
            'total': round(total, 2),
            'mean': round(mean, 2),
            'median': round(median, 2),
            'min': round(min_amt, 2),
            'max': round(max_amt, 2),
            'stdDev': round(std_dev, 2),
            'p25': round(p25, 2),
            'p75': round(p75, 2),
            'range': f"{round(min_amt, 2)}–{round(max_amt, 2)}",
        }

    @staticmethod
    def analyze_temporal_pattern(transactions: List[Dict]) -> Dict:
        """Analyze temporal spending patterns"""
        if not transactions:
            return {}

        monthly_totals = {}
        daily_counts = {}

        for tx in transactions:
            date_str = str(tx.get('date', '')).strip()
            amount = float(tx.get('amount', 0))

            # Monthly aggregation
            if date_str and len(date_str) >= 7:
                month_key = date_str[:7]
                if month_key not in monthly_totals:
                    monthly_totals[month_key] = 0
                monthly_totals[month_key] += amount

            # Daily count (for frequency)
            if date_str:
                if date_str not in daily_counts:
                    daily_counts[date_str] = 0
                daily_counts[date_str] += 1

        if not monthly_totals:
            return {}

        sorted_months = sorted(monthly_totals.keys())
        values = list(monthly_totals.values())

        # Calculate temporal trend
        if len(sorted_months) >= 2:
            first_half_avg = sum(values[:len(values)//2]) / (len(values)//2)
            second_half_avg = sum(values[len(values)//2:]) / (len(values) - len(values)//2)
            trend = ((second_half_avg - first_half_avg) / first_half_avg * 100) if first_half_avg > 0 else 0
            trend_direction = 'increasing' if trend > 5 else ('decreasing' if trend < -5 else 'stable')
        else:
            trend_direction = 'insufficient'
            trend = 0

        return {
            'monthsAnalyzed': len(sorted_months),
            'timeSpan': f"{sorted_months[0]} to {sorted_months[-1]}",
            'monthlyAverage': round(sum(values) / len(values), 2),
            'monthlyMin': round(min(values), 2),
            'monthlyMax': round(max(values), 2),
            'trend': round(trend, 1),
            'trendDirection': trend_direction,
            'transactionDensity': round(len(transactions) / len(sorted_months), 1),
        }

    @staticmethod
    def calculate_feature_impact(
        transactions: List[Dict],
        category_distribution: Dict,
        amount_patterns: Dict
    ) -> Dict:
        """Calculate which features have most impact on total expenses"""
        total_expense = sum(t['totalAmount'] for t in category_distribution.values())

        if total_expense == 0:
            return {}

        # Find high-impact categories
        impacts = []
        for category, stats in category_distribution.items():
            impact_pct = stats['percentOfTotal']
            impacts.append({
                'category': category,
                'impact': impact_pct,
                'avgAmount': stats['averageAmount'],
                'frequency': stats['transactionCount'],
            })

        impacts_sorted = sorted(impacts, key=lambda x: x['impact'], reverse=True)

        # Identify patterns
        top_category = impacts_sorted[0] if impacts_sorted else None
        top_impact = top_category['impact'] if top_category else 0

        # Feature variance (diversity)
        num_categories = len(category_distribution)
        diversity = 'high' if num_categories > 5 else ('medium' if num_categories > 2 else 'low')

        return {
            'topImpactCategory': top_category['category'] if top_category else None,
            'topCategoryImpact': round(top_impact, 1),
            'topTransactions': impacts_sorted[:3],
            'categoryDiversity': diversity,
            'uniqueCategories': num_categories,
        }


# ═══════════════════════════════════════════════════════════════════════════════
# 🧮 ML BASELINE LOGIC - Simple deterministic predictions
# ═══════════════════════════════════════════════════════════════════════════════

def calculate_baseline_prediction(
    transactions: List[Dict],
    income: float,
    pipeline_level: str
) -> Dict:
    """
    Calculate deterministic baseline prediction from transactions
    FÁZE 5.0C: Improved deterministic logic (no ML model yet)

    Uses historical transaction data to estimate future expenses.
    Formula: (recent_avg * 0.6) + (overall_avg * 0.4) weighted by data quality

    Real model training will come in FÁZE 5.1+
    """

    now = datetime.utcnow()
    current_period = now.strftime('%Y-%m')

    # Handle empty data
    if not transactions:
        return {
            'period': current_period,
            'totalPredictedExpense': 0.0,
            'confidence': 0.0,
            'categories': {},
            'dataPoints': 0,
            'pipelineLevel': pipeline_level,
            'confidenceFactors': {
                'dataFrequency': 0.0,
                'transactionCount': 0.0,
                'expenseRatio': 0.0,
                'incomeConstraint': 0.0
            },
            '_debug': {
                'inputSummary': {
                    'transactions': 0,
                    'monthsOfHistory': 0,
                    'totalHistoricalExpense': 0.0,
                    'income': round(income, 2) if income > 0 else None,
                    'expenseToIncomeRatio': 'N/A'
                },
                'confidenceBreakdown': {
                    'dataFrequency': '0% (no history)',
                    'transactionCount': '0% (no transactions)',
                    'expenseRatio': '0% (no data)',
                    'incomeConstraint': '100% (provided)' if income > 0 else '20% (not provided)'
                },
                'predictionMethod': 'no data available'
            }
        }

    # FÁZE 5.2C: Analyze real features to inform deterministic computation
    category_distribution = FeatureAnalyzer.analyze_category_distribution(transactions)
    amount_patterns = FeatureAnalyzer.analyze_amount_patterns(transactions)
    temporal_pattern = FeatureAnalyzer.analyze_temporal_pattern(transactions)
    feature_impact = FeatureAnalyzer.calculate_feature_impact(transactions, category_distribution, amount_patterns)

    # Group transactions by category (for backward compatibility)
    category_totals = {}
    category_counts = {}
    monthly_totals = {}

    for tx in transactions:
        category = str(tx.get('category', 'other')).strip().lower()
        amount = float(tx.get('amount', 0))
        date_str = str(tx.get('date', '')).strip()

        # Track by category
        if category not in category_totals:
            category_totals[category] = 0
            category_counts[category] = 0
        category_totals[category] += amount
        category_counts[category] += 1

        # Track by month for trend analysis
        if date_str and len(date_str) >= 7:  # YYYY-MM format
            month_key = date_str[:7]
            if month_key not in monthly_totals:
                monthly_totals[month_key] = 0
            monthly_totals[month_key] += amount

    total_expense = sum(category_totals.values())
    num_transactions = len(transactions)

    # Calculate weighted prediction
    if monthly_totals:
        # Sort months chronologically
        sorted_months = sorted(monthly_totals.keys())
        num_months = len(sorted_months)

        # Use recent months more heavily (3-month window if available)
        if num_months >= 3:
            recent_months = sorted_months[-3:]
            recent_avg = sum(monthly_totals[m] for m in recent_months) / len(recent_months)
            overall_avg = total_expense / num_months
            predicted_expense = (recent_avg * 0.6) + (overall_avg * 0.4)
        elif num_months > 0:
            predicted_expense = total_expense / num_months
        else:
            predicted_expense = total_expense

        # Confidence based on 4 rule-based factors:
        # 1. Data frequency (30%): more months = more reliable trend
        # 2. Transaction count (30%): more data points = more reliable
        # 3. Expense ratio (20%): good if expenses < income
        # 4. Income constraint (20%): provided or not

        months_score = min(1.0, num_months / 12)  # Full score at 12 months
        txns_score = min(1.0, num_transactions / 50)  # Full score at 50+ txns
        expense_ratio = min(1.0, predicted_expense / (income or 1))  # Good if < income
        expense_ratio_score = (1 - abs(1 - expense_ratio)) * 0.2
        income_score = 1.0 if income > 0 else 0.2

        # Weighted confidence calculation (4 factors)
        confidence = (months_score * 0.3 + txns_score * 0.3 +
                     expense_ratio_score + income_score * 0.2)
        confidence = max(0.1, min(0.99, confidence))  # Clamp 0.1-0.99

        # Store confidence factors for debugging
        confidence_factors = {
            'dataFrequency': round(months_score, 2),
            'transactionCount': round(txns_score, 2),
            'expenseRatio': round(expense_ratio_score, 2),
            'incomeConstraint': round(income_score, 2)
        }
    else:
        # No monthly data, use simple average
        predicted_expense = total_expense
        txns_score = min(1.0, num_transactions / 50)
        confidence = min(0.95, 0.4 + (num_transactions * 0.01))

        # Confidence factors for no-monthly-data case
        confidence_factors = {
            'dataFrequency': 0.0,
            'transactionCount': round(txns_score, 2),
            'expenseRatio': 0.0,
            'incomeConstraint': 1.0 if income > 0 else 0.2
        }

    # Build response with normalized categories
    response_categories = {}
    if total_expense > 0:
        # Distribute predicted expense proportionally by historical category ratios
        for category, hist_amount in category_totals.items():
            ratio = hist_amount / total_expense
            predicted_category = predicted_expense * ratio
            response_categories[category] = round(predicted_category, 2)
    else:
        response_categories = {}

    # Calculate expense-to-income ratio for debugging
    expense_to_income_ratio = "N/A"
    if income > 0:
        ratio = total_expense / income
        expense_to_income_ratio = f"{ratio:.1f}x"

    # Debug information (FÁZE 5.2C: enhanced with real feature insights)
    debug_info = {
        'inputSummary': {
            'transactions': num_transactions,
            'monthsOfHistory': len(monthly_totals) if monthly_totals else 0,
            'totalHistoricalExpense': round(total_expense, 2),
            'income': round(income, 2) if income > 0 else None,
            'expenseToIncomeRatio': expense_to_income_ratio
        },
        'confidenceBreakdown': {
            'dataFrequency': f"{round(months_score * 100, 0):.0f}% ({len(sorted_months) if monthly_totals else 0} months)" if monthly_totals else "0% (no history)",
            'transactionCount': f"{round(txns_score * 100, 0):.0f}% ({num_transactions} txns)" if monthly_totals else f"{round(txns_score * 100, 0):.0f}% ({num_transactions} txns)",
            'expenseRatio': f"{round(expense_ratio_score * 100, 0):.0f}% (expense:income = {expense_to_income_ratio})",
            'incomeConstraint': f"{round(income_score * 100, 0):.0f}% ('provided' if income > 0 else 'not provided')"
        },
        'predictionMethod': "weighted recent (60%) + overall (40%) average" if monthly_totals and len(sorted_months) >= 1 else "sum of transactions",
        # FÁZE 5.2C: Feature-based insights (real data, not placeholders)
        'featureAnalysis': {
            'categoryDistribution': category_distribution,
            'amountPatterns': amount_patterns,
            'temporalPattern': temporal_pattern,
            'featureImpact': feature_impact,
        }
    }

    prediction = {
        'period': current_period,
        'totalPredictedExpense': round(predicted_expense, 2),
        'confidence': round(confidence, 2),
        'confidenceFactors': confidence_factors,
        'categories': response_categories,
        'dataPoints': num_transactions,
        'pipelineLevel': pipeline_level,
        '_debug': debug_info  # Internal debug info
    }

    return prediction


# ═══════════════════════════════════════════════════════════════════════════════
# 🌐 HTTP ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@app.route('/health', methods=['GET'])
def health_check():
    """
    Health check endpoint
    Used by Node/Firebase layer to verify Python runtime is available
    """
    logger.info('Health check requested')
    return jsonify({
        'status': 'healthy',
        'service': 'ml-runtime',
        'timestamp': datetime.utcnow().isoformat() + 'Z',
        'version': '5.0.0'
    }), 200


@app.route('/predict', methods=['POST'])
def predict():
    """
    FÁZE 5.0C: Main ML prediction endpoint with input parsing, validation, and response
    Receives request from Node/Firebase, parses, validates, processes, returns valid response

    Processing Pipeline:
    1. Get and validate JSON
    2. Validate request contract (type checking, semantic validation)
    3. Parse and normalize input
    4. Generate deterministic baseline prediction
    5. Build response following contract
    6. Validate response contract
    7. Return response with metadata

    Prediction Logic (Deterministic - No ML Model Yet):
    - Groups transactions by category
    - Analyzes monthly trends (3-month window preferred)
    - Calculates weighted prediction: (recent_avg * 0.6) + (overall_avg * 0.4)
    - Confidence score based on: data frequency (30%), transaction count (30%),
      expense ratio (20%), income constraint (20%)
    - Distributes predicted amount proportionally by historical category breakdown

    Request Contract:
    {
        "uid": "user-123",
        "pipelineLevel": "L1",
        "modelVersion": "1.0",
        "transactions": [
            {"category": "food", "amount": 50.00, "date": "2026-06-01"},
            {"category": "transport", "amount": 25.00, "date": "2026-06-02"}
        ],
        "income": 5000.00,
        "debugMode": false
    }

    Response Contract:
    {
        "status": "success",
        "uid": "user-123",
        "pipelineLevel": "L1",
        "modelVersion": "1.0",
        "processedAt": "2026-06-07T15:30:00.000Z",
        "predictions": [
            {
                "period": "2026-06",
                "totalPredictedExpense": 3500.00,
                "confidence": 0.87,
                "categories": {...},
                "dataPoints": 45,
                "pipelineLevel": "L1"
            }
        ],
        "error": null,
        "debugMetadata": {
            "processingTimeMs": 125,
            "pythonRuntime": "3.9",
            "frameworkVersion": "Flask/2.3.2",
            "parsed": {
                "uid": "user-123",
                "pipelineLevel": "L1",
                "transactionCount": 2,
                "income": 5000.00
            }
        }
    }
    """

    import time
    start_time = time.time()
    data = None

    try:
        # Step 1: Get and validate JSON format
        data = request.get_json()

        if data is None:
            logger.error('Request missing Content-Type: application/json')
            return jsonify({
                'status': 'failed',
                'error': 'Request must be JSON (Content-Type: application/json)',
                'debugMetadata': {'processingTimeMs': 0}
            }), 400

        if not data:
            logger.error('Empty JSON body')
            return jsonify({
                'status': 'failed',
                'error': 'Request body cannot be empty',
                'debugMetadata': {'processingTimeMs': 0}
            }), 400

        # Step 2: Validate request contract (detailed validation)
        is_valid, error_msg = RequestContract.validate(data)
        if not is_valid:
            logger.warning(f'Request validation failed: {error_msg}', extra={'uid': data.get('uid')})
            # FÁZE 5.1F: Classify error type
            error_type = 'INVALID_REQUEST'
            if 'Missing required field' in error_msg:
                error_type = 'MISSING_REQUIRED_FIELD'
            elif 'must be one of' in error_msg:
                error_type = 'INVALID_ENUM_VALUE'
            elif 'must be' in error_msg or 'cannot be' in error_msg:
                error_type = 'INVALID_INPUT'

            logger.error({
                'event': '[ERROR] Deterministic computation failed',
                'uid': data.get('uid'),
                'errorType': error_type,
                'reason': error_msg
            })

            return jsonify({
                'status': 'failed',
                'error': error_msg,
                'uid': data.get('uid'),
                'debugMetadata': {'processingTimeMs': 0}
            }), 400

        # Step 3: Parse and normalize input
        try:
            parsed = RequestParser.parse(data)
            logger.debug(f"Request parsed successfully: {RequestParser.get_summary(parsed)}")
        except ValueError as parse_err:
            logger.error(f'Request parsing failed: {str(parse_err)}')
            # FÁZE 5.1F: Log parse error
            logger.error({
                'event': '[ERROR] Deterministic computation failed',
                'uid': data.get('uid'),
                'errorType': 'PARSE_ERROR',
                'reason': str(parse_err)
            })

            return jsonify({
                'status': 'failed',
                'error': f'Input parsing error: {str(parse_err)}',
                'uid': data.get('uid'),
                'debugMetadata': {'processingTimeMs': 0}
            }), 400

        # FÁZE 5.2B: Validate features and target presence
        transactions = parsed['transactions']
        features_valid, features_error = FeatureExtractor.validate_features(transactions)
        if not features_valid:
            logger.error(f'Feature validation failed: {features_error}')
            logger.error({
                'event': '[ERROR] Dataset validation failed',
                'uid': data.get('uid'),
                'errorType': 'INVALID_FEATURES',
                'reason': features_error
            })
            return jsonify({
                'status': 'failed',
                'error': f'Dataset feature validation failed: {features_error}',
                'uid': data.get('uid'),
                'debugMetadata': {'processingTimeMs': 0}
            }), 400

        # FÁZE 5.2B: Check target presence (optional warning, not failure)
        target_valid, target_error = TargetInfo.validate_target_presence(transactions, parsed['income'])
        if not target_valid:
            logger.warning(f'Target validation issue: {target_error}', extra={'uid': data.get('uid')})

        logger.info(f"[PREDICT] Processing: uid={parsed['uid']}, level={parsed['pipelineLevel']}, txns={len(parsed['transactions'])}")

        # Extract parsed data
        uid = parsed['uid']
        pipeline_level = parsed['pipelineLevel']
        model_version = parsed['modelVersion']
        transactions = parsed['transactions']
        income = parsed['income']
        debug_mode = parsed['debugMode']

        # Step 4: Generate prediction (using parsed data)
        try:
            prediction = calculate_baseline_prediction(transactions, income, pipeline_level)
            logger.debug(f"Prediction generated: {prediction}")
        except Exception as pred_err:
            logger.error(f'Prediction calculation failed: {str(pred_err)}')
            # FÁZE 5.1F: Log computation error
            logger.error({
                'event': '[ERROR] Deterministic computation failed',
                'uid': uid,
                'errorType': 'COMPUTATION_FAILED',
                'reason': f'Unexpected error during prediction calculation: {str(pred_err)}'
            })

            return jsonify({
                'status': 'failed',
                'error': f'Prediction calculation failed: {str(pred_err)}',
                'uid': uid,
                'debugMetadata': {'processingTimeMs': int((time.time() - start_time) * 1000)}
            }), 500

        # Step 5: Build response following contract
        response = ResponseContract.build(data, [prediction])

        # Step 6: Validate response contract
        is_valid, validation_error = ResponseContract.validate(response)
        if not is_valid:
            logger.error(f'Response validation failed: {validation_error}')
            return jsonify({
                'status': 'failed',
                'error': f'Internal error: {validation_error}',
                'uid': uid,
                'debugMetadata': {'processingTimeMs': int((time.time() - start_time) * 1000)}
            }), 500

        # Step 7: Add processing time and parsing metadata
        processing_time_ms = int((time.time() - start_time) * 1000)
        response['debugMetadata']['processingTimeMs'] = processing_time_ms
        response['debugMetadata']['parsed'] = RequestParser.get_summary(parsed)

        # FÁZE 5.1C: Add input and confidence explanation
        if '_debug' in prediction:
            debug_data = prediction['_debug']
            response['debugMetadata']['inputs'] = debug_data['inputSummary']
            response['debugMetadata']['confidenceExplained'] = debug_data['confidenceBreakdown']
            response['debugMetadata']['calculationMethod'] = debug_data['predictionMethod']

            # Remove _debug from prediction objects (internal only)
            for pred in response['predictions']:
                if '_debug' in pred:
                    del pred['_debug']

        # FÁZE 5.2B: Add dataset metadata for training readiness
        dataset_meta = DatasetMetadata.generate(transactions, parsed['income'])
        response['debugMetadata']['datasetMetadata'] = dataset_meta
        logger.info(f"[DATASET] Features validated: uid={uid}, rows={dataset_meta['datasetSize']['totalRows']}, categories={dataset_meta['datasetSize']['uniqueCategories']}, months={dataset_meta['targets']['monthsAvailable']}")

        # FÁZE 5.2C: Add feature-based analysis to response
        if '_debug' in prediction and 'featureAnalysis' in prediction['_debug']:
            response['debugMetadata']['featureAnalysis'] = prediction['_debug']['featureAnalysis']
            feature_analysis = prediction['_debug']['featureAnalysis']
            top_category = feature_analysis['featureImpact'].get('topImpactCategory', 'N/A')
            top_impact = feature_analysis['featureImpact'].get('topCategoryImpact', 0)
            logger.info(f"[FEATURES] Analyzed: uid={uid}, top_category={top_category}, impact={top_impact}%, diversity={feature_analysis['featureImpact'].get('categoryDiversity', 'N/A')}")

        # FÁZE 5.1E: Observability logging for deterministic result
        logger.info(f"[RESULT] Generated: uid={uid}, expense={prediction['totalPredictedExpense']}, confidence={prediction['confidence']}, method=deterministic")
        logger.info(f"[CONFIDENCE] Assigned: uid={uid}, score={prediction['confidence']}, factors=4-factor-weighted")
        if '_debug' in prediction:
          logger.info(f"[METADATA] Attached: uid={uid}, inputs={len(prediction['_debug']['inputSummary'])}, factors={len(prediction['_debug']['confidenceBreakdown'])}")

        logger.info(f"[SUCCESS] Prediction completed: uid={uid}, level={pipeline_level}, confidence={prediction['confidence']}, time={processing_time_ms}ms")

        return jsonify(response), 200

    except Exception as e:
        logger.error(f'[ERROR] Prediction error: {str(e)}', extra={'uid': data.get('uid') if data else None})
        processing_time_ms = int((time.time() - start_time) * 1000)

        return jsonify({
            'status': 'failed',
            'error': str(e),
            'uid': data.get('uid') if data else None,
            'debugMetadata': {'processingTimeMs': processing_time_ms}
        }), 500


@app.route('/dataset-info', methods=['POST'])
def dataset_info():
    """
    FÁZE 5.2B: Dataset analysis endpoint
    Validates features and target presence without making predictions

    Request: Same as /predict
    Response: Dataset metadata including feature coverage, target presence, training readiness
    """
    import time
    start_time = time.time()
    data = None

    try:
        # Get and validate JSON
        data = request.get_json()

        if data is None:
            return jsonify({
                'status': 'failed',
                'error': 'Request must be JSON',
                'debugMetadata': {'processingTimeMs': 0}
            }), 400

        # Validate request contract
        is_valid, error_msg = RequestContract.validate(data)
        if not is_valid:
            logger.warning(f'Dataset info request validation failed: {error_msg}')
            return jsonify({
                'status': 'failed',
                'error': error_msg,
                'uid': data.get('uid'),
                'debugMetadata': {'processingTimeMs': 0}
            }), 400

        # Parse and normalize
        try:
            parsed = RequestParser.parse(data)
        except ValueError as e:
            logger.error(f'Dataset info parsing failed: {str(e)}')
            return jsonify({
                'status': 'failed',
                'error': f'Parsing failed: {str(e)}',
                'uid': data.get('uid'),
                'debugMetadata': {'processingTimeMs': 0}
            }), 400

        transactions = parsed['transactions']
        uid = parsed['uid']

        # Validate features
        features_valid, features_error = FeatureExtractor.validate_features(transactions)
        if not features_valid:
            logger.error(f'Dataset info feature validation failed: {features_error}')
            return jsonify({
                'status': 'failed',
                'error': f'Feature validation failed: {features_error}',
                'uid': uid,
                'debugMetadata': {'processingTimeMs': 0}
            }), 400

        # Analyze dataset
        feature_coverage = FeatureExtractor.analyze_feature_coverage(transactions)
        target_quality = TargetInfo.analyze_target_quality(transactions)
        dataset_meta = DatasetMetadata.generate(transactions, parsed['income'])

        # Check target presence
        target_valid, target_error = TargetInfo.validate_target_presence(transactions, parsed['income'])

        processing_time_ms = int((time.time() - start_time) * 1000)

        response = {
            'status': 'success',
            'uid': uid,
            'pipelineLevel': parsed['pipelineLevel'],
            'processedAt': datetime.utcnow().isoformat() + 'Z',
            'features': {
                'validation': 'passed',
                'coverage': feature_coverage['featurePresence'],
                'categories': feature_coverage['uniqueCategories'],
                'amountRange': feature_coverage['amountRange'],
            },
            'targets': {
                'validation': 'passed' if target_valid else 'warning',
                'validationMessage': '' if target_valid else target_error,
                'monthlyTargets': target_quality['targetPresence'],
                'monthsAvailable': target_quality['monthsAvailable'],
                'timeSpan': target_quality.get('timeSpan', 'N/A'),
                'targetRange': target_quality.get('targetRange'),
            },
            'datasetMetadata': dataset_meta,
            'readyForTraining': dataset_meta['summary']['readyForTraining'],
            'recommendation': dataset_meta['summary']['recommendation'],
            'debugMetadata': {
                'processingTimeMs': processing_time_ms,
                'totalRows': len(transactions),
                'dataSource': 'Firestore (real user transactions)',
            }
        }

        logger.info(f"[DATASET-INFO] Analysis: uid={uid}, rows={len(transactions)}, features_ok={features_valid}, target_ok={target_valid}, ready={dataset_meta['summary']['readyForTraining']}")

        return jsonify(response), 200

    except Exception as e:
        logger.error(f'Dataset info error: {str(e)}')
        processing_time_ms = int((time.time() - start_time) * 1000)
        return jsonify({
            'status': 'failed',
            'error': str(e),
            'uid': data.get('uid') if data else None,
            'debugMetadata': {'processingTimeMs': processing_time_ms}
        }), 500


@app.route('/status', methods=['GET'])
def runtime_status():
    """
    Runtime status endpoint
    Returns Python runtime status and capabilities
    """
    logger.info('Status check requested')
    return jsonify({
        'status': 'active',
        'pythonVersion': '3.9',
        'framework': 'Flask',
        'endpoints': [
            '/health',
            '/status',
            '/predict',
            '/dataset-info'
        ],
        'capabilities': [
            'baseline-prediction',
            'dataset-validation',
            'feature-analysis',
            'target-detection'
        ],
        'timestamp': datetime.utcnow().isoformat() + 'Z'
    }), 200


# ═══════════════════════════════════════════════════════════════════════════════
# 🚀 ERROR HANDLERS
# ═══════════════════════════════════════════════════════════════════════════════

@app.errorhandler(404)
def not_found(error):
    """Handle 404 errors"""
    logger.error(f'Endpoint not found: {request.path}')
    return jsonify({
        'status': 'error',
        'error': f'Endpoint not found: {request.path}',
        'debugMetadata': {}
    }), 404


@app.errorhandler(500)
def internal_error(error):
    """Handle 500 errors"""
    logger.error(f'Internal server error: {str(error)}')
    return jsonify({
        'status': 'error',
        'error': 'Internal server error',
        'debugMetadata': {}
    }), 500


# ═══════════════════════════════════════════════════════════════════════════════
# 🏃 ENTRY POINT
# ═══════════════════════════════════════════════════════════════════════════════

if __name__ == '__main__':
    logger.info(f'Starting ML Runtime Server on port {PORT}')
    logger.info('Available endpoints:')
    logger.info('  GET  /health        - Health check')
    logger.info('  GET  /status        - Runtime status')
    logger.info('  POST /predict       - ML prediction with feature validation')
    logger.info('  POST /dataset-info  - Dataset analysis (FÁZE 5.2B)')

    app.run(
        host='127.0.0.1',
        port=PORT,
        debug=DEBUG,
        threaded=True
    )
