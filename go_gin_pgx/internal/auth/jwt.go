// Package auth 는 RS256 JWT 검증을 담당한다 (SR §4).
// Spring 구현의 JwtVerifier / JwtAuthenticationFilter 에 대응한다.
package auth

import (
	"crypto/rsa"
	"crypto/x509"
	"encoding/base64"
	"errors"
	"fmt"
	"regexp"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/yeonhyukkim/go_gin_pgx/internal/resultcode"
)

const (
	expectedAlgorithm = "RS256"
	expectedIssuer    = "PUSH_BROADCASTING"
)

// VerifyError 는 검증 실패 원인에 해당하는 resultCode 를 담는다.
type VerifyError struct {
	Code resultcode.Code
}

func (e *VerifyError) Error() string { return e.Code.String() }

// errUnexpectedAlg 는 RS256 이 아닌 알고리즘을 만났을 때 keyfunc 이 반환하는 센티널 에러다.
var errUnexpectedAlg = errors.New("unexpected signing method")

// chatClaims 는 토큰 payload 다 (SR §4: iss, userPk).
type chatClaims struct {
	UserPk string `json:"userPk"`
	jwt.RegisteredClaims
}

// Verifier 는 주입된 RSA Public Key 로 토큰을 검증한다.
type Verifier struct {
	key *rsa.PublicKey
}

// NewVerifier 는 Verifier 를 만든다.
func NewVerifier(key *rsa.PublicKey) *Verifier {
	return &Verifier{key: key}
}

// Verify 는 토큰을 검증하고 userPk 를 반환한다. 실패 시 *VerifyError 를 반환한다.
func (v *Verifier) Verify(token string) (uuid.UUID, error) {
	var claims chatClaims
	_, err := jwt.ParseWithClaims(token, &claims, func(t *jwt.Token) (any, error) {
		// RS256 만 허용 (SR §4).
		if t.Method.Alg() != expectedAlgorithm {
			return nil, errUnexpectedAlg
		}
		return v.key, nil
	})
	if err != nil {
		return uuid.Nil, &VerifyError{Code: mapJWTError(err)}
	}

	if claims.Issuer != expectedIssuer {
		return uuid.Nil, &VerifyError{Code: resultcode.TokenInvalidIssuer}
	}

	userPk, perr := uuid.Parse(claims.UserPk)
	if perr != nil {
		return uuid.Nil, &VerifyError{Code: resultcode.TokenMalformed}
	}
	return userPk, nil
}

// mapJWTError 는 golang-jwt 의 에러를 resultCode 로 매핑한다.
func mapJWTError(err error) resultcode.Code {
	switch {
	case errors.Is(err, errUnexpectedAlg):
		return resultcode.TokenInvalidAlgorithm
	case errors.Is(err, jwt.ErrTokenExpired):
		return resultcode.TokenExpired
	case errors.Is(err, jwt.ErrTokenSignatureInvalid):
		return resultcode.TokenInvalidSignature
	case errors.Is(err, jwt.ErrTokenMalformed):
		return resultcode.TokenMalformed
	default:
		return resultcode.TokenMalformed
	}
}

var pemHeaderPattern = regexp.MustCompile(`-----(BEGIN|END)[^-]*-----`)

// MustParsePublicKey 는 Base64(X.509 SubjectPublicKeyInfo) 문자열을 RSA Public Key 로 파싱한다.
// PEM 헤더/공백이 섞여 있어도 처리한다. 실패하면 panic 한다(부팅 시점 설정 오류).
func MustParsePublicKey(encoded string) *rsa.PublicKey {
	key, err := parsePublicKey(encoded)
	if err != nil {
		panic(fmt.Sprintf("invalid RSA public key in JWT_PUBLIC_KEY: %v", err))
	}
	return key
}

func parsePublicKey(encoded string) (*rsa.PublicKey, error) {
	sanitized := pemHeaderPattern.ReplaceAllString(encoded, "")
	sanitized = regexp.MustCompile(`\s`).ReplaceAllString(sanitized, "")

	der, err := base64.StdEncoding.DecodeString(sanitized)
	if err != nil {
		return nil, fmt.Errorf("base64 decode: %w", err)
	}
	pub, err := x509.ParsePKIXPublicKey(der)
	if err != nil {
		return nil, fmt.Errorf("parse PKIX: %w", err)
	}
	rsaPub, ok := pub.(*rsa.PublicKey)
	if !ok {
		return nil, errors.New("not an RSA public key")
	}
	return rsaPub, nil
}
